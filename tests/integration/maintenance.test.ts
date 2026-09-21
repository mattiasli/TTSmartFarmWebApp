import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { FarmStore, sha256 } from '../../apps/api/src/db';
import { createIsolatedDatabase, databaseAvailable } from './postgres';

if (!(await databaseAvailable())) throw new Error('PostgreSQL is required for maintenance integration tests.');

describe('scheduled PostgreSQL maintenance', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let store: FarmStore;
  beforeEach(async () => { db = await createIsolatedDatabase(); store = new FarmStore(db.pool); }, 60_000);
  afterEach(async () => { await db.close(); });

  async function seedOldRows(count: number) {
    await db.pool.query(`INSERT INTO telemetry_samples (farm_id, sampled_at, payload)
      SELECT $1, now() - interval '120 days' + n * interval '1 second', '{"t":1}'
      FROM generate_series(1, $2::int) n`, [LOCAL_FARM_ID, count]);
    await db.pool.query(`INSERT INTO events (id, farm_id, category, severity, created_at)
      SELECT gen_random_uuid(), $1, 'retention-test', 'info', now() - interval '120 days'
      FROM generate_series(1, $2::int)`, [LOCAL_FARM_ID, count]);
    await db.pool.query(`INSERT INTO commands
      (id, farm_id, actor_scope, idempotency_key, action, payload, status, confirmation_mode, request_hash, requested_at)
      SELECT gen_random_uuid(), $1, 'system:maintenance-test', gen_random_uuid()::text, 'fan.set', '{}',
        'superseded', 'state_match', 'fixture-hash', now() - interval '120 days'
      FROM generate_series(1, $2::int)`, [LOCAL_FARM_ID, count]);
  }

  it('bounds every retention batch and clears links without deleting retained data', async () => {
    await seedOldRows(1005);
    const oldCommand = (await db.pool.query('SELECT id FROM commands LIMIT 1')).rows[0].id;
    const event = await store.recordEvent({ farmId: LOCAL_FARM_ID, category: 'retained', severity: 'info', details: {} });
    await db.pool.query('UPDATE events SET command_id=$1 WHERE id=$2', [oldCommand, event.id]);
    const latest = await db.pool.query(`INSERT INTO commands
      (id,farm_id,actor_scope,idempotency_key,action,payload,status,confirmation_mode,request_hash,superseded_by)
      VALUES (gen_random_uuid(),$1,'system:maintenance-test','retained','fan.set','{}','superseded','state_match','hash',$2)
      RETURNING id`, [LOCAL_FARM_ID, oldCommand]);
    expect(await store.purgeRetention()).toEqual({ samples: 1000, events: 1000, commands: 1000 });
    expect(await store.purgeRetention()).toEqual({ samples: 5, events: 5, commands: 5 });
    expect(await store.purgeRetention()).toEqual({ samples: 0, events: 0, commands: 0 });
    expect((await db.pool.query('SELECT command_id FROM events WHERE id=$1', [event.id])).rows).toEqual([{ command_id: null }]);
    expect((await db.pool.query('SELECT superseded_by FROM commands WHERE id=$1', [latest.rows[0].id])).rows).toEqual([{ superseded_by: null }]);
  });

  it('starts real cleanup with the API and restricts size/status observations to admins', async () => {
    await seedOldRows(1005);
    await db.pool.query(`INSERT INTO oauth_flows
      (id,state_hash,browser_binding_hash,pkce_verifier,environment,expires_at)
      VALUES (gen_random_uuid(),'expired-state','binding','private-fixture','local',now()-interval '1 hour')`);
    const admin = await store.getUserByGithubId('43301236');
    await store.createSession({ userId: admin!.id, tokenHash: sha256('maintenance-admin'), csrfSecret: 'csrf' });
    const viewer = await store.upsertUser({ githubId: 'maintenance-viewer', username: 'viewer' });
    await store.setMembership({ farmId: LOCAL_FARM_ID, userId: viewer.id, role: 'viewer' });
    await store.createSession({ userId: viewer.id, tokenHash: sha256('maintenance-viewer'), csrfSecret: 'csrf' });
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: db.url }));
    try {
      await app.ready();
      const url = `/api/v1/farms/${LOCAL_FARM_ID}/diagnostics/database`;
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url, headers: { cookie: 'smartfarm_session=maintenance-viewer' } })).statusCode).toBe(403);
      await expect.poll(async () => {
        const response = await app.inject({ method: 'GET', url, headers: { cookie: 'smartfarm_session=maintenance-admin' } });
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        return response.json().maintenance.lastRetention?.rows;
      }).toEqual({ samples: 1005, events: 1005, commands: 1005 });
      const status = (await app.inject({ method: 'GET', url, headers: { cookie: 'smartfarm_session=maintenance-admin' } })).json();
      expect(status.migrations).toContain('003_retention_indexes.sql');
      expect(status.tables.every((table: { expired_rows: number; index_bytes: number }) => table.expired_rows === 0 && table.index_bytes > 0)).toBe(true);
      expect((await db.pool.query('SELECT count(*)::int AS count FROM oauth_flows')).rows[0].count).toBe(0);
      expect(JSON.stringify(status)).not.toContain('private-fixture');
    } finally { await app.close(); }
  });
});
