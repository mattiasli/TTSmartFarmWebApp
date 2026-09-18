import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
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

    await appA.close();
    await appB.close();
  });
});
