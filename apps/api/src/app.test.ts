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
});
