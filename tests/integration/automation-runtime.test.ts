import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEALTHY_TELEMETRY_FIXTURE, LOCAL_FARM_ID } from '@smartfarm/contracts';
import { loadConfig } from '../../apps/api/src/config';
import { FarmController } from '../../apps/api/src/controller';
import { FarmStore } from '../../apps/api/src/db';
import { ScriptedFarmLink } from '../../apps/api/src/farm-link';
import { createIsolatedDatabase, databaseAvailable } from './postgres';

const available = await databaseAvailable();
if (!available) {
  throw new Error('PostgreSQL is required for P09 runtime tests. Start Docker Desktop and run npm run infra:up.');
}

describe('P09 persisted automation runtime', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('restores attempts/cooldown and stays paused until explicit resume', async () => {
    const store = new FarmStore(db.pool);
    await store.saveRuntime({
      farmId: LOCAL_FARM_ID,
      pausedReason: 'Paused after backend start. Resume explicitly.',
      masterEnabled: true,
      attempts: 3,
      cooldownUntil: new Date(Date.now() + 60_000),
      lastPumpStopAt: new Date(),
      guardStatus: 'confirmed',
    });
    const saved = await store.getRuntime(LOCAL_FARM_ID);
    const link = new ScriptedFarmLink();
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, soil: 10 });
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator', DATABASE_URL: db.url }),
      link,
      () => Date.now(),
      store,
      {
        ownership: 'owner',
        runtime: {
          attempts: saved?.attempts,
          cooldownUntilMs: saved?.cooldownUntil?.getTime() ?? null,
          lastPumpStopMs: saved?.lastPumpStopAt?.getTime() ?? null,
        },
      },
    );
    try {
      await controller.becomeOwner();
      const snap = controller.snapshot();
      expect(snap.automations.runtime.masterEnabled).toBe(false);
      expect(snap.automations.runtime.attempts).toBe(3);
      expect(link.published.some((row) => row.payload === 'pulse')).toBe(false);
    } finally {
      await controller.close();
    }
  });
});
