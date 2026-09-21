import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUTOMATIONS, LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp, createDeps } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { createIsolatedDatabase, databaseAvailable } from './postgres';

const available = await databaseAvailable();
if (!available) {
  throw new Error('PostgreSQL is required for P07 lock tests. Start Docker Desktop and run npm run infra:up.');
}

describe('P07 two-process controller lock', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('pauses after the actual lock session is terminated and reacquires without replay', async () => {
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator', DATABASE_URL: db.url });
    const deps = await createDeps(config);
    const app = await buildApp(config, deps);
    const blocker = await db.pool.connect();
    const key = await deps.store!.getFarmLockKey(LOCAL_FARM_ID);
    const publish = vi.spyOn(deps.controller.link, 'publish');
    try {
      deps.controller.startAutomations();
      const result = await blocker.query<{ pid: number }>(
        `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
         AND objid = $1`, [key],
      );
      expect(result.rows).toHaveLength(1);
      await blocker.query('SELECT pg_terminate_backend($1)', [result.rows[0]!.pid]);
      // Reserve the released lock before the controller retries, as another owner would.
      await blocker.query('SELECT pg_advisory_lock($1)', [key]);
      await expect.poll(() => deps.controller.snapshot().connection.ownership).toBe('waiting_for_owner');
      expect(deps.controller.snapshot().automations.runtime.masterEnabled).toBe(false);
      publish.mockClear();
      expect(() => deps.controller.startAutomations()).toThrow();
      await expect(deps.controller.command({ type: 'fan.set', on: true }, crypto.randomUUID(), 'test')).rejects.toThrow();
      expect(publish).not.toHaveBeenCalled();
      await blocker.query('SELECT pg_advisory_unlock($1)', [key]);
      await expect.poll(() => deps.controller.ownership, { timeout: 5_000 }).toBe('owner');
      expect(deps.controller.snapshot().automations.runtime.masterEnabled).toBe(false);
    } finally {
      publish.mockRestore();
      await blocker.query('SELECT pg_advisory_unlock($1)', [key]);
      blocker.release();
      await app.close();
    }
  });

  it('T075/T078 one owner, the other stays ready without the lock', async () => {
    const configA = loadConfig({
      NODE_ENV: 'test',
      APP_ENV: 'local',
      FARM_MODE: 'simulator',
      DATABASE_URL: db.url,
    });
    const configB = loadConfig({
      NODE_ENV: 'test',
      APP_ENV: 'local',
      FARM_MODE: 'simulator',
      DATABASE_URL: db.url,
    });
    const depsA = await createDeps(configA);
    const appA = await buildApp(configA, depsA);
    const readyA = await appA.inject({ method: 'GET', url: '/health/ready' });
    expect(readyA.statusCode).toBe(200);
    expect(readyA.json().status).toBe('ready');

    const depsB = await createDeps(configB);
    const appB = await buildApp(configB, depsB);
    const readyB = await appB.inject({ method: 'GET', url: '/health/ready' });
    expect(readyB.statusCode).toBe(200);
    expect(readyB.json().status).toBe('ready');

    const ownerA = depsA.controller.ownership === 'owner';
    const ownerB = depsB.controller.ownership === 'owner';
    expect(ownerA !== ownerB).toBe(true);
    expect(ownerA || ownerB).toBe(true);

    const waiter = ownerA ? appB : appA;
    const login = await waiter.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const command = await waiter.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands`,
      headers: {
        'content-type': 'application/json',
        cookie: `smartfarm_session=${cookie?.value}`,
        'x-csrf-token': csrf,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: { type: 'fan.set', on: true },
    });
    expect(command.statusCode).toBe(503);
    expect(command.json().error.code).toBe('CONTROLLER_UNAVAILABLE');

    try {
      const owner = ownerA ? depsA.controller : depsB.controller;
      const successor = ownerA ? depsB.controller : depsA.controller;
      const saved = await owner.configure({ ...DEFAULT_AUTOMATIONS, fanOn: 32 });
      owner.startAutomations();
      const ownerStore = ownerA ? depsA.store : depsB.store;
      await expect.poll(async () => (await ownerStore?.getRuntime(LOCAL_FARM_ID))?.masterEnabled).toBe(true);
      await (ownerA ? appA : appB).close();
      // No manual becomeOwner call: a real deployment must recover on its own.
      await expect.poll(() => successor.ownership, { timeout: 5_000 }).toBe('owner');
      const snapshot = successor.snapshot();
      expect(snapshot.automations.runtime.masterEnabled).toBe(false);
      expect(snapshot.automations.settings.fanOn).toBe(32);
      expect(snapshot.automations.revision).toBe(saved.automations.revision);
    } finally {
      await appA.close();
      await appB.close();
    }
  });
});
