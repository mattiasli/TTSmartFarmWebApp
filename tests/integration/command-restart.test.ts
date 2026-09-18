import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEALTHY_TELEMETRY_FIXTURE, LOCAL_FARM_ID } from '@smartfarm/contracts';
import { loadConfig } from '../../apps/api/src/config';
import { FarmController } from '../../apps/api/src/controller';
import { FarmStore } from '../../apps/api/src/db';
import { ScriptedFarmLink } from '../../apps/api/src/farm-link';
import { createIsolatedDatabase, databaseAvailable } from './postgres';

const available = await databaseAvailable();
if (!available) {
  throw new Error('PostgreSQL is required for P08 restart tests. Start Docker Desktop and run npm run infra:up.');
}

describe('P08 restart does not replay commands', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('T020 marks a pending reserved command uncertain and never republishes it', async () => {
    const store = new FarmStore(db.pool);
    const key = crypto.randomUUID();
    const request = { type: 'fan.set' as const, on: true };
    const reserved = await store.reserveCommand({
      farmId: LOCAL_FARM_ID,
      actorScope: 'user:local',
      idempotencyKey: key,
      request,
    });
    expect(reserved.dispatched).toBe(true);
    expect(reserved.command.status).toBe('accepted');

    const link = new ScriptedFarmLink();
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator', DATABASE_URL: db.url }),
      link,
      () => Date.now(),
      store,
      { ownership: 'owner' },
    );
    try {
      await controller.becomeOwner();
      expect(controller.getCommand(reserved.command.id)?.status).toBe('uncertain');
      const again = await controller.command(request, key);
      expect(again.id).toBe(reserved.command.id);
      expect(again.status).toBe('uncertain');
      expect(link.published).toHaveLength(0);
      const persisted = await store.getCommand(reserved.command.id);
      expect(persisted?.status).toBe('uncertain');
    } finally {
      await controller.close();
    }
  });
});
