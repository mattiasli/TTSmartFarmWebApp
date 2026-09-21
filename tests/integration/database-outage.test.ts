import { createServer, connect, type Socket } from 'node:net';
import { expect, it, vi } from 'vitest';
import { buildApp, createDeps } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { createIsolatedDatabase } from './postgres';

it('survives loss of every database connection and recovers paused without replay', async () => {
  const db = await createIsolatedDatabase();
  const target = new URL(db.url);
  const sockets = new Set<Socket>();
  let disconnected = false;
  const proxy = createServer((incoming) => {
    if (disconnected) { incoming.destroy(); return; }
    const upstream = connect(Number(target.port || 5432), target.hostname);
    for (const socket of [incoming, upstream]) {
      sockets.add(socket);
      socket.on('error', () => { incoming.destroy(); upstream.destroy(); });
      socket.on('close', () => { sockets.delete(socket); incoming.destroy(); upstream.destroy(); });
    }
    incoming.pipe(upstream).pipe(incoming);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('Missing test proxy port');
  const url = new URL(db.url);
  url.hostname = '127.0.0.1';
  url.port = String(address.port);
  const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator', DATABASE_URL: url.href });
  const deps = await createDeps(config);
  const app = await buildApp(config, deps);
  const publish = vi.spyOn(deps.controller.link, 'publish');
  try {
    await app.ready();
    const saved = await deps.controller.configure({ ...deps.controller.engine.settings, fanOn: 33 });
    await expect.poll(() => deps.controller.snapshot().connection.fresh).toBe(true);
    await expect.poll(() => deps.pool!.totalCount - deps.pool!.idleCount).toBe(0);
    deps.controller.startAutomations();
    await expect.poll(async () => (await deps.store!.getRuntime(config.FARM_ID))?.masterEnabled).toBe(true);
    // Drop lock, request pool and maintenance pool together; reject all reconnects.
    disconnected = true;
    for (const socket of sockets) socket.destroy();
    await expect.poll(() => deps.controller.snapshot().connection.ownership).toBe('waiting_for_owner');
    publish.mockClear();
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().controller).toBe('waiting_for_owner');
    expect(() => deps.controller.startAutomations()).toThrow();
    await expect(deps.controller.command({ type: 'fan.set', on: true }, crypto.randomUUID(), 'test')).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(publish).not.toHaveBeenCalled();
    disconnected = false;
    await expect.poll(() => deps.controller.ownership, { timeout: 10_000 }).toBe('owner');
    const snapshot = deps.controller.snapshot();
    expect(snapshot.automations.runtime.masterEnabled).toBe(false);
    expect(snapshot.automations.settings.fanOn).toBe(33);
    expect(snapshot.automations.revision).toBe(saved.automations.revision);
    expect(publish).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(200);
    // Interrupt an in-flight background runtime write as well as idle clients.
    deps.controller.startAutomations();
    disconnected = true;
    for (const socket of sockets) socket.destroy();
    await expect.poll(() => deps.controller.ownership).toBe('waiting_for_owner');
    expect(deps.controller.snapshot().automations.runtime.masterEnabled).toBe(false);
    disconnected = false;
    await expect.poll(() => deps.controller.ownership, { timeout: 10_000 }).toBe('owner');
    expect(deps.controller.snapshot().automations.runtime.masterEnabled).toBe(false);
  } finally {
    disconnected = false;
    publish.mockRestore();
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await db.close();
  }
});
