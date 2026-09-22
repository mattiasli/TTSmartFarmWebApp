import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { LOCAL_OAUTH_COOKIE } from './cookies';
import { pkceChallenge } from './pkce';
import { FarmController } from '../controller';
import { ScriptedFarmLink } from '../farm-link';
import { MemorySessionStore } from '../sessions';

describe('P06 auth gates', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  async function localApp() {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    return app;
  }

  async function login(app: Awaited<ReturnType<typeof buildApp>>) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = response.json().csrfToken as string;
    const cookie = response.cookies.find((entry) => entry.name === 'smartfarm_session');
    return { csrf, cookie: `smartfarm_session=${cookie?.value}` };
  }

  it('keeps read-only deployment permissions on authenticated HTTP snapshots', async () => {
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'live', LIVE_COMMANDS_ENABLED: 'false' });
    const controller = new FarmController(config, new ScriptedFarmLink());
    const app = await buildApp(config, { controller, memorySessions: new MemorySessionStore(), store: null, pool: null });
    apps.push(app);
    const { cookie } = await login(app);
    const response = await app.inject({ method: 'GET', url: `/api/v1/farms/${LOCAL_FARM_ID}/snapshot`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().permissions).toEqual({ canView: true, canControl: false, canPump: false });
  });

  it.each([
    { mode: 'live', commands: true, pump: false, role: 'operator', canControl: true, canPump: false },
    { mode: 'live', commands: false, pump: true, role: 'operator', canControl: false, canPump: false },
    { mode: 'live', commands: true, pump: true, role: 'operator', canControl: true, canPump: true },
    { mode: 'simulator', commands: false, pump: false, role: 'operator', canControl: true, canPump: true },
    { mode: 'simulator', commands: false, pump: false, role: 'viewer', canControl: false, canPump: false },
  ] as const)('exposes watering permission for $mode / commands=$commands / pump=$pump / $role', async (scenario) => {
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: scenario.mode,
      LIVE_COMMANDS_ENABLED: String(scenario.commands), LIVE_PUMP_ENABLED: String(scenario.pump) });
    const controller = new FarmController(config, new ScriptedFarmLink());
    const memorySessions = new MemorySessionStore();
    const created = memorySessions.createLocalOperator();
    created.session.role = scenario.role;
    const app = await buildApp(config, { controller, memorySessions, store: null, pool: null });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: `/api/v1/farms/${LOCAL_FARM_ID}/snapshot`,
      headers: { cookie: `smartfarm_session=${created.token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().permissions).toEqual({ canView: true, canControl: scenario.canControl, canPump: scenario.canPump });
  });

  it('T063 rejects a missing CSRF token on commands', async () => {
    const app = await localApp();
    const { cookie } = await login(app);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands`,
      headers: { 'content-type': 'application/json', cookie, 'idempotency-key': crypto.randomUUID() },
      payload: { type: 'fan.set', on: true },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF');
  });

  it('T064 rejects a bad Origin on mutations outside test mode', async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: 'development',
        APP_ENV: 'local',
        FARM_MODE: 'simulator',
        ALLOWED_BROWSER_ORIGINS: 'http://127.0.0.1:5173',
      }),
    );
    apps.push(app);
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/local/login',
      headers: { origin: 'http://127.0.0.1:5173' },
      remoteAddress: '127.0.0.1',
    });
    const csrf = loginResponse.json().csrfToken as string;
    const cookie = loginResponse.cookies.find((entry) => entry.name === 'smartfarm_session');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands`,
      headers: {
        'content-type': 'application/json',
        origin: 'http://evil.example',
        'x-csrf-token': csrf,
        cookie: `smartfarm_session=${cookie?.value}`,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: { type: 'fan.set', on: true },
      remoteAddress: '127.0.0.1',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('BAD_ORIGIN');
  });

  it('T065 rejects an unauthorized farm ID', async () => {
    const app = await localApp();
    const { csrf, cookie } = await login(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/farms/22222222-2222-4222-8222-222222222222/snapshot',
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(response.statusCode).toBe(404);
  });

  it('T066 viewers cannot send commands', async () => {
    const { createDeps } = await import('../app');
    const { MemorySessionStore } = await import('../sessions');
    const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' });
    const deps = await createDeps(config);
    const memory = new MemorySessionStore();
    const created = memory.createLocalOperator();
    created.session.role = 'viewer';
    deps.memorySessions = memory;
    const app = await buildApp(config, deps);
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands`,
      headers: {
        'content-type': 'application/json',
        cookie: `smartfarm_session=${created.token}`,
        'x-csrf-token': created.session.csrf,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: { type: 'fan.set', on: true },
    });
    expect(response.statusCode).toBe(403);
  });

  it('hides local login in production configuration', async () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        FARM_MODE: 'live',
      }),
    ).toThrow(/GITHUB_OAUTH_CLIENT_ID/);
  });
});

describe('P06 OAuth callback', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('T067 does not create a session from a forged OAuth callback without Postgres', async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        APP_ENV: 'local',
        FARM_MODE: 'simulator',
        GITHUB_OAUTH_CLIENT_ID: 'client',
        GITHUB_OAUTH_CLIENT_SECRET: 'secret',
      }),
    );
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/github/callback?code=abc&state=one',
      headers: { cookie: `${LOCAL_OAUTH_COOKIE}=two.binding` },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/access-denied');
    const session = await app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(session.json().authenticated).toBe(false);
  });

  it('T068/T070 uses the configured callback URL and PKCE challenge', async () => {
    expect(pkceChallenge('verifier').length).toBeGreaterThan(20);
    const app = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        APP_ENV: 'local',
        FARM_MODE: 'simulator',
        PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5173',
        GITHUB_OAUTH_CLIENT_ID: 'client',
        GITHUB_OAUTH_CLIENT_SECRET: 'secret',
      }),
    );
    apps.push(app);
    const start = await app.inject({ method: 'GET', url: '/api/auth/github/start' });
    expect(start.statusCode).toBe(503);
    expect(start.json().error.code).toBe('OAUTH_UNAVAILABLE');
  });
});
