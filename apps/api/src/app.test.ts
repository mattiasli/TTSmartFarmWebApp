import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';

describe('api health', () => {
  it('reports live and ready without farm ownership', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }));
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', farmMode: 'simulator' });
    await app.close();
  });
});
