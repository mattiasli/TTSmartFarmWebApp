import { randomUUID } from 'node:crypto';
import { DEFAULT_AUTOMATIONS, LOCAL_FARM_ID } from '@smartfarm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DedicatedControllerLock,
  FarmStore,
  IdempotencyConflictError,
  LastAdminError,
  QueryWindowError,
  RevisionConflictError,
  appliedMigrations,
  migrate,
} from '../../apps/api/src/db';
import { createInitOnlyDatabase, createIsolatedDatabase, databaseAvailable } from './postgres';

const available = await databaseAvailable();
if (!available) {
  throw new Error('PostgreSQL is required for P05. Start Docker Desktop and run npm run infra:up.');
}

describe('P05 postgres repositories', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let store: FarmStore;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    store = new FarmStore(db.pool);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('applies all migrations onto an empty database', async () => {
    const versions = await appliedMigrations(db.url);
    expect(versions.map((row) => row.version)).toEqual(['001_init.sql', '002_p05_complete.sql', '003_retention_indexes.sql']);
  });

  it('upgrades a 001-only fixture schema through the current migration', async () => {
    const fixture = await createInitOnlyDatabase();
    try {
      const before = await appliedMigrations(fixture.url);
      expect(before.map((row) => row.version)).toEqual(['001_init.sql']);
      await migrate(fixture.url);
      const after = await appliedMigrations(fixture.url);
      expect(after.map((row) => row.version)).toEqual(['001_init.sql', '002_p05_complete.sql', '003_retention_indexes.sql']);
    } finally {
      await fixture.close();
    }
  });

  it('rejects invalid membership roles at the database boundary', async () => {
    await expect(
      db.pool.query(
        `INSERT INTO farm_memberships (farm_id, user_id, role)
         SELECT $1, id, 'owner' FROM users LIMIT 1`,
        [LOCAL_FARM_ID],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects invalid automation settings before they are stored', async () => {
    await expect(
      store.saveConfig({
        farmId: LOCAL_FARM_ID,
        expectedRevision: 1,
        settings: { ...DEFAULT_AUTOMATIONS, tankRecover: 5, tankLow: 20 },
      }),
    ).rejects.toThrow(/Tank recovery/);
  });

  it('persists config revisions and rejects a stale If-Match', async () => {
    const first = await store.saveConfig({
      farmId: LOCAL_FARM_ID,
      expectedRevision: 1,
      settings: { ...DEFAULT_AUTOMATIONS, soilDry: 40 },
    });
    expect(first.revision).toBe(2);
    await expect(
      store.saveConfig({
        farmId: LOCAL_FARM_ID,
        expectedRevision: 1,
        settings: { ...DEFAULT_AUTOMATIONS, soilDry: 41 },
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    const current = await store.getConfig(LOCAL_FARM_ID);
    expect(current?.settings.soilDry).toBe(40);
    expect(current?.revision).toBe(2);
  });

  it('rolls back a failed config transaction', async () => {
    const before = await store.getConfig(LOCAL_FARM_ID);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE automation_configs SET revision = revision + 1, settings = $2 WHERE farm_id = $1`,
        [LOCAL_FARM_ID, { ...DEFAULT_AUTOMATIONS, soilDry: 12 }],
      );
      throw new Error('boom');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const after = await store.getConfig(LOCAL_FARM_ID);
    expect(after?.revision).toBe(before?.revision);
    expect(after?.settings.soilDry).toBe(before?.settings.soilDry);
  });

  it('reserves an idempotency key once and returns the same row on retry', async () => {
    const key = randomUUID();
    const request = { type: 'fan.set' as const, on: true };
    const first = await store.reserveCommand({
      farmId: LOCAL_FARM_ID,
      actorScope: 'user:operator',
      idempotencyKey: key,
      request,
    });
    expect(first.dispatched).toBe(true);
    const second = await store.reserveCommand({
      farmId: LOCAL_FARM_ID,
      actorScope: 'user:operator',
      idempotencyKey: key,
      request,
    });
    expect(second.dispatched).toBe(false);
    expect(second.command.id).toBe(first.command.id);
    await expect(
      store.reserveCommand({
        farmId: LOCAL_FARM_ID,
        actorScope: 'user:operator',
        idempotencyKey: key,
        request: { type: 'fan.set', on: false },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('does not let concurrent duplicate keys both dispatch', async () => {
    const key = randomUUID();
    const request = { type: 'light.set' as const, on: true };
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.reserveCommand({
          farmId: LOCAL_FARM_ID,
          actorScope: 'user:race',
          idempotencyKey: key,
          request,
        }),
      ),
    );
    expect(results.filter((row) => row.dispatched)).toHaveLength(1);
    expect(new Set(results.map((row) => row.command.id)).size).toBe(1);
  });

  it('expires and deletes used OAuth flows and websocket tickets', async () => {
    const now = new Date();
    const flow = await store.createOauthFlow({
      state: 'state-1',
      browserBinding: 'browser-1',
      pkceVerifier: 'verifier',
      environment: 'local',
      ttlMs: 1,
      now: new Date(now.getTime() - 2_000),
    });
    await expect(
      store.consumeOauthFlow({ state: 'state-1', browserBinding: 'browser-1', now }),
    ).rejects.toThrow(/expired/);
    const ticket = await store.createWsTicket({
      sessionId: (
        await store.createSession({
          userId: (await store.getUserByGithubId('43301236'))!.id,
          tokenHash: 'abc',
          csrfSecret: 'csrf',
        })
      ).id,
      farmId: LOCAL_FARM_ID,
      origin: 'http://127.0.0.1:5173',
      rawTicket: 'ticket-1',
      ttlMs: 30_000,
    });
    const consumed = await store.consumeWsTicket('ticket-1', 'http://127.0.0.1:5173');
    expect(consumed.id).toBe(ticket.id);
    await expect(store.consumeWsTicket('ticket-1', 'http://127.0.0.1:5173')).rejects.toThrow(/already used/);
    expect(flow.id).toBeTruthy();
    const swept = await store.sweepExpiredAuth(now);
    expect(swept.oauth).toBeGreaterThanOrEqual(1);
  });

  it('keeps at least one active administrator', async () => {
    const admin = await store.getUserByGithubId('43301236');
    expect(admin).toBeTruthy();
    await expect(store.removeMembership(LOCAL_FARM_ID, admin!.id)).rejects.toBeInstanceOf(LastAdminError);
  });

  it('samples history at most once per 10 seconds and caps query windows', async () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const first = await store.recordTelemetrySample(LOCAL_FARM_ID, { t: 21, soil: 30 }, t0);
    const duplicate = await store.recordTelemetrySample(
      LOCAL_FARM_ID,
      { t: 22, soil: 31 },
      new Date(t0.getTime() + 3_000),
    );
    expect(first).toBeTruthy();
    expect(duplicate).toBeNull();
    const later = await store.recordTelemetrySample(
      LOCAL_FARM_ID,
      { t: 23, soil: 32 },
      new Date(t0.getTime() + 10_000),
    );
    expect(later).toBeTruthy();
    const points = await store.queryHistory({
      farmId: LOCAL_FARM_ID,
      from: t0,
      to: new Date(t0.getTime() + 60_000),
      path: 't',
      bucketSeconds: 10,
    });
    expect(points.length).toBeGreaterThanOrEqual(1);
    await expect(
      store.queryHistory({
        farmId: LOCAL_FARM_ID,
        from: t0,
        to: new Date(t0.getTime() + 31 * 24 * 60 * 60 * 1000),
        path: 't',
      }),
    ).rejects.toBeInstanceOf(QueryWindowError);
  });

  it('paginates events with a created_at/id cursor', async () => {
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const event = await store.recordEvent({
        farmId: LOCAL_FARM_ID,
        category: 'test.page',
        severity: 'info',
        details: { i },
      });
      ids.push(event.id);
      await db.pool.query('UPDATE events SET created_at = $2::timestamptz WHERE id = $1',
        [event.id, `2026-09-21T12:00:00.123${i}00Z`]);
    }
    const page = await store.listEvents({ farmId: LOCAL_FARM_ID, category: 'test.page', limit: 2 });
    expect(page.events).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    const next = await store.listEvents({
      farmId: LOCAL_FARM_ID,
      category: 'test.page',
      limit: 2,
      cursor: page.nextCursor,
    });
    expect(next.events).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect([...page.events, ...next.events].map((event) => event.id)).toEqual([...ids].reverse());
  });

  it('holds a session advisory lock on a dedicated connection', async () => {
    const key = await store.getFarmLockKey(LOCAL_FARM_ID);
    const first = new DedicatedControllerLock(db.url, key);
    const second = new DedicatedControllerLock(db.url, key);
    expect(await first.tryAcquire()).toBe(true);
    expect(await second.tryAcquire()).toBe(false);
    expect(await first.isHealthy()).toBe(true);
    await first.release();
    expect(await second.tryAcquire()).toBe(true);
    await second.release();
  });

  it('purges old samples, events, and commands in bounded batches', async () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    await db.pool.query(
      `INSERT INTO telemetry_samples (farm_id, sampled_at, payload) VALUES ($1, $2, '{"t":1}')`,
      [LOCAL_FARM_ID, old],
    );
    const purged = await store.purgeRetention(new Date());
    expect(purged.samples).toBeGreaterThanOrEqual(1);
  });
});


