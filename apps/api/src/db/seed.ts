import { DEFAULT_AUTOMATIONS, LOCAL_FARM_ID, LOCAL_FARM_NAME } from '@smartfarm/contracts';
import type pg from 'pg';
import { FarmStore } from './store';

export const LOCAL_BOOTSTRAP_GITHUB_ID = '43301236';
export const LOCAL_BOOTSTRAP_USERNAME = 'mattiasli';

export async function seedLocal(pool: pg.Pool, input: {
  farmId?: string;
  farmName?: string;
  environment?: string;
  lockKey?: number;
  githubId?: string;
  username?: string;
} = {}) {
  const farmId = input.farmId ?? LOCAL_FARM_ID;
  const githubId = input.githubId ?? process.env.BOOTSTRAP_ADMIN_GITHUB_ID ?? LOCAL_BOOTSTRAP_GITHUB_ID;
  const username = input.username ?? process.env.BOOTSTRAP_ADMIN_USERNAME ?? LOCAL_BOOTSTRAP_USERNAME;
  await pool.query(
    `INSERT INTO farms (id, name, environment, controller_lock_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [farmId, input.farmName ?? LOCAL_FARM_NAME, input.environment ?? 'local', input.lockKey ?? 1],
  );
  const store = new FarmStore(pool);
  const user = await store.upsertUser({ githubId, username, displayName: username });
  await pool.query(
    `INSERT INTO farm_memberships (farm_id, user_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (farm_id, user_id) DO NOTHING`,
    [farmId, user.id],
  );
  await store.upsertAllowlist({
    githubId,
    farmId,
    role: 'admin',
    createdBy: 'local-seed',
  });
  if (!(await store.getConfig(farmId))) {
    await store.saveConfig({ farmId, settings: DEFAULT_AUTOMATIONS, expectedRevision: 0 });
  }
  if (!(await store.getRuntime(farmId))) {
    await store.saveRuntime({
      farmId,
      pausedReason: 'Paused after backend start. Resume explicitly.',
      masterEnabled: false,
      guardStatus: 'unknown',
    });
  }
  await store.savePreferences({
    farmId,
    lcdLine1: '',
    lcdLine2: '',
    lcdMode: 'status',
  });
  return { farmId, user };
}
