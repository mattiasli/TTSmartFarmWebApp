import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp, createDeps } from './app';
import { loadConfig } from './config';
import { MemoryFarmLink } from './farm-link';

describe('environmental simulator controls', () => {
  const apps: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => { while (apps.length) await apps.pop()!.close(); });
  const url = `/api/v1/farms/${LOCAL_FARM_ID}/simulator/scenario`;

  it('bounds a telemetry stall while keeping device pulse timers running', async () => {
    vi.useFakeTimers();
    const link = new MemoryFarmLink();
    try {
      await link.publish('smartfarm/cmd/pump', 'pulse');
      expect(link.latest()?.data.pump).toBe(1);
      const received = link.latest()!.receivedAtMs;
      link.silenceTelemetry();
      await vi.advanceTimersByTimeAsync(5000);
      expect(link.latest()!.receivedAtMs).toBe(received);
      expect(link.farm.snapshot().pump).toBe(0);
      await vi.advanceTimersByTimeAsync(3250);
      expect(link.latest()!.receivedAtMs).toBeGreaterThan(received);
      expect(link.latest()?.data.pump).toBe(0);
    } finally { await link.close(); vi.useRealTimers(); }
  });

  it('changes environmental readings while preserving applied guard and output state', async () => {
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' });
    const deps = await createDeps(config);
    const app = await buildApp(config, deps);
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const headers = { cookie: `smartfarm_session=${login.cookies[0]!.value}`,
      'x-csrf-token': login.json().csrfToken as string };
    const link = deps.controller.link as MemoryFarmLink;
    await link.publish('smartfarm/cmd/fan', 'on');
    await link.publish('smartfarm/cmd/pumpguard', '25,35');
    const response = await app.inject({ method: 'POST', url, headers, payload: { scenario: 'rain' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().readings).toMatchObject({ rain: true, fan: true, guard: true, tankLow: 25, tankRecover: 35 });
    expect((await app.inject({ method: 'POST', url, headers, payload: { scenario: 'arbitrary' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, headers, payload: { scenario: 'legacy' } })).statusCode).toBe(400);
  });

  it('rejects anonymous, viewer and missing-CSRF changes', async () => {
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' });
    const deps = await createDeps(config);
    const app = await buildApp(config, deps);
    apps.push(app);
    expect((await app.inject({ method: 'POST', url, payload: { scenario: 'rain' } })).statusCode).toBe(401);
    const { token, session } = deps.memorySessions.createLocalOperator();
    const cookie = `smartfarm_session=${token}`;
    expect((await app.inject({ method: 'POST', url, headers: { cookie }, payload: { scenario: 'rain' } })).statusCode).toBe(403);
    session.role = 'viewer';
    expect((await app.inject({ method: 'POST', url,
      headers: { cookie, 'x-csrf-token': session.csrf }, payload: { scenario: 'rain' } })).statusCode).toBe(403);
  });

  it.each(['production', 'mqtt', 'live-commands', 'live-pump'] as const)('does not register the route for %s', async (condition) => {
    const base = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' });
    const deps = await createDeps(base);
    const config = { ...base };
    if (condition === 'production') config.APP_ENV = 'production';
    if (condition === 'mqtt') config.SIMULATOR_TRANSPORT = 'mqtt';
    if (condition === 'live-commands') config.LIVE_COMMANDS_ENABLED = true;
    if (condition === 'live-pump') config.LIVE_PUMP_ENABLED = true;
    const app = await buildApp(config, deps);
    apps.push(app);
    expect((await app.inject({ method: 'POST', url, payload: { scenario: 'rain' } })).statusCode).toBe(404);
  });
});
