import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { createPool } from '../../apps/api/src/db';
import { createInitOnlyDatabase } from './postgres';

it('pre-deploy migration and startup seed the same configured farm on an empty database', async () => {
  const db = await createInitOnlyDatabase();
  const pool = createPool(db.url);
  const farmId = crypto.randomUUID();
  const env = { ...process.env, NODE_ENV: 'test', APP_ENV: 'staging', FARM_MODE: 'simulator',
    SIMULATOR_TRANSPORT: 'memory', DATABASE_URL: db.url, FARM_ID: farmId, FARM_NAME: 'Configured farm' };
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'apps/api/src/db/run-migrate.ts'],
      { env, windowsHide: true, timeout: 30_000 });
    const app = await buildApp(loadConfig(env));
    try {
      expect((await app.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(200);
      expect((await pool.query('SELECT id, name, environment, controller_lock_key FROM farms')).rows)
        .toEqual([{ id: farmId, name: 'Configured farm', environment: 'staging', controller_lock_key: '1' }]);
      expect((await pool.query('SELECT farm_id FROM login_allowlist')).rows).toEqual([{ farm_id: farmId }]);
    } finally { await app.close(); }
  } finally {
    await pool.end();
    await db.close();
  }
}, 60_000);
