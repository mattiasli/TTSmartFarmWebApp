import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp } from './app';
import { loadConfig } from './config';

describe('api health and local commands', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it('reports live and ready without farm ownership', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', farmMode: 'simulator' });
  });

  it('turns the simulated fan on through the command API', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    expect(login.statusCode).toBe(200);
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    expect(cookie?.value).toBeTruthy();
    const command = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands`,
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        cookie: `smartfarm_session=${cookie?.value}`,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: { type: 'fan.set', on: true },
    });
    expect(command.statusCode).toBe(202);
    const commandId = command.json().id as string;
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/commands/${commandId}`,
      headers: { cookie: `smartfarm_session=${cookie?.value}` },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().id).toBe(commandId);
    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/snapshot`,
      headers: { cookie: `smartfarm_session=${cookie?.value}` },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().readings.fan).toBe(true);
    expect(snapshot.json().simulation).toBe(true);
    expect(snapshot.json().automations.runtime.masterEnabled).toBe(false);
  });

  it('starts paused and can start automations on the server', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const headers = {
      'x-csrf-token': csrf,
      cookie: `smartfarm_session=${cookie?.value}`,
    };
    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/snapshot`,
      headers,
    });
    expect(before.json().automations.runtime.masterEnabled).toBe(false);
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/automations/start`,
      headers,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().automations.runtime.masterEnabled).toBe(true);
  });

  it('rejects a stale automation settings revision', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const headers = {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      cookie: `smartfarm_session=${cookie?.value}`,
    };
    const snap = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/snapshot`,
      headers,
    });
    const settings = snap.json().automations.settings;
    const first = await app.inject({
      method: 'PUT',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/automations/settings`,
      headers: { ...headers, 'if-match': '1' },
      payload: { ...settings, soilDry: 40 },
    });
    expect(first.statusCode).toBe(200);
    const stale = await app.inject({
      method: 'PUT',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/automations/settings`,
      headers: { ...headers, 'if-match': '1' },
      payload: { ...settings, soilDry: 41 },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('returns empty history and events without PostgreSQL', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const headers = { cookie: `smartfarm_session=${cookie?.value}` };
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/history?path=t`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().points).toEqual([]);
    const events = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/events`,
      headers,
    });
    expect(events.statusCode).toBe(200);
    expect(events.json().events).toEqual([]);
    expect(events.json().nextCursor).toBeNull();
  });

  it('rejects an unsupported history series', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/history?path=nope`,
      headers: { cookie: `smartfarm_session=${cookie?.value}` },
    });
    expect(history.statusCode).toBe(400);
  });

  it('mints a memory websocket ticket with CSRF', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const minted = await app.inject({
      method: 'POST',
      url: '/api/v1/realtime/tickets',
      headers: {
        'content-type': 'application/json',
        cookie: `smartfarm_session=${cookie?.value}`,
        'x-csrf-token': csrf,
      },
      payload: { farmId: LOCAL_FARM_ID },
    });
    expect(minted.statusCode).toBe(200);
    expect(minted.json().ticket).toEqual(expect.any(String));
    expect(minted.json().wsUrl).toEqual(expect.any(String));
  });

  it('pauses automations from the host-owned pause route', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const headers = {
      'x-csrf-token': csrf,
      cookie: `smartfarm_session=${cookie?.value}`,
    };
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/automations/start`,
      headers,
    });
    expect(started.statusCode).toBe(200);
    const paused = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${LOCAL_FARM_ID}/automations/pause`,
      headers,
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().automations.runtime.masterEnabled).toBe(false);
  });
});
