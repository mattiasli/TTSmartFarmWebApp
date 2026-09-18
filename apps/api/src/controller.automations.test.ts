import { DEFAULT_AUTOMATIONS, HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { FarmController } from './controller';
import { ScriptedFarmLink } from './farm-link';

describe('P09 controller automation runner', () => {
  const controllers: FarmController[] = [];
  afterEach(async () => {
    while (controllers.length) await controllers.pop()?.close();
  });

  it('emits a single irrigation pulse through the command service after cooldown', async () => {
    let now = 1_000_000;
    const link = new ScriptedFarmLink();
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, soil: 10 }, now);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => now,
      null,
      { ownership: 'owner', settings: { ...DEFAULT_AUTOMATIONS, cooldown: 15 } },
    );
    controllers.push(controller);
    controller.snapshot();
    controller.startAutomations();
    expect(link.published.filter((row) => row.topic.endsWith('/pump') && row.payload === 'pulse')).toHaveLength(0);
    now += 16_000;
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, soil: 10 }, now);
    controller.snapshot();
    const started = Date.now();
    while (!link.published.some((row) => row.topic.endsWith('/pump') && row.payload === 'pulse')) {
      if (Date.now() - started > 1000) throw new Error('Automation pulse was not published.');
      await new Promise((resolve) => setTimeout(resolve, 10));
      controller.snapshot();
    }
    expect(link.published.filter((row) => row.topic.endsWith('/pump') && row.payload === 'pulse')).toHaveLength(1);
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(true);
  });

  it('does not auto-resume restored runtime after a simulated restart', () => {
    let now = 1_000_000;
    const link = new ScriptedFarmLink();
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, soil: 10 }, now);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => now,
      null,
      {
        ownership: 'owner',
        runtime: { attempts: 2, cooldownUntilMs: now + 60_000, lastPumpStopMs: now - 5_000 },
      },
    );
    controllers.push(controller);
    const snap = controller.snapshot();
    expect(snap.automations.runtime.masterEnabled).toBe(false);
    expect(snap.automations.runtime.attempts).toBe(2);
    now += 70_000;
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, soil: 10 }, now);
    controller.snapshot();
    expect(link.published.some((row) => row.payload === 'pulse')).toBe(false);
  });
});
