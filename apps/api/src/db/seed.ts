import { DEFAULT_AUTOMATIONS, LOCAL_FARM_ID, LOCAL_FARM_NAME } from '@smartfarm/contracts';
import type pg from 'pg';
import { FarmStore } from './store';
import { randomUUID } from 'node:crypto';
import { withTransaction } from './pool';

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
  await withTransaction(pool, async (client) => {
    const created = await client.query(
      `INSERT INTO farms (id, name, environment, controller_lock_key)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [farmId, input.farmName ?? LOCAL_FARM_NAME, input.environment ?? 'local', input.lockKey ?? 1]);
    if (!created.rowCount) {
      await client.query('UPDATE farms SET name=$2 WHERE id=$1', [farmId, input.farmName ?? LOCAL_FARM_NAME]);
      return;
    }
    // Bootstrap is atomic with creating a new farm. Restart never restores removed access.
    const user = await client.query(`INSERT INTO users (id, github_id, username, display_name, last_login_at)
      VALUES ($1,$2,$3,$3,now()) ON CONFLICT (github_id) DO UPDATE SET username=EXCLUDED.username RETURNING id`,
    [randomUUID(), githubId, username]);
    await client.query(`INSERT INTO farm_memberships (farm_id,user_id,role) VALUES ($1,$2,'admin')`, [farmId,user.rows[0]!.id]);
    await client.query(`INSERT INTO login_allowlist (github_id,farm_id,role,created_by) VALUES ($1,$2,'admin','local-seed')
      ON CONFLICT (github_id) DO UPDATE SET farm_id=EXCLUDED.farm_id,role='admin',revoked_at=NULL`, [githubId,farmId]);
  });
  const store = new FarmStore(pool);
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
  return { farmId };
}
