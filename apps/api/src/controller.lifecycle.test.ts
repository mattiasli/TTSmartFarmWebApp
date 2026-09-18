import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { CommandPolicyError } from '@smartfarm/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { FarmController } from './controller';
import { ScriptedFarmLink } from './farm-link';

describe('P07 controller lifecycle', () => {
  const controllers: FarmController[] = [];
  afterEach(async () => {
    while (controllers.length) await controllers.pop()?.close();
  });

  function make(link = new ScriptedFarmLink(), ownership: 'owner' | 'waiting_for_owner' = 'owner') {
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => Date.now(),
      null,
      { ownership },
    );
    controllers.push(controller);
    return { controller, link };
  }

  it('T009 ignores retained telemetry', () => {
    const { controller, link } = make();
    link.inject(HEALTHY_TELEMETRY_FIXTURE, Date.now(), true);
    expect(controller.snapshot().readings).toBeNull();
    expect(controller.snapshot().connection.fresh).toBe(false);
  });

  it('T010/T011 treats an old MQTT epoch as a new connection that starts paused', () => {
    const { controller, link } = make();
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    controller.startAutomations();
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(true);
    link.reconnect();
    const snap = controller.snapshot();
    expect(snap.automations.runtime.masterEnabled).toBe(false);
    expect(snap.connection.mqttEpoch).toBe(link.mqttEpoch);
  });

  it('T012 treats 4000 ms as stale and requires explicit resume', () => {
    const { controller, link } = make();
    const now = Date.now();
    link.inject(HEALTHY_TELEMETRY_FIXTURE, now - 4000);
    const snap = controller.snapshot();
    expect(snap.connection.fresh).toBe(false);
    expect(() => controller.startAutomations()).toThrow(/fresh/i);
  });

  it('T075 waiting owners stay HTTP-ready but cannot mutate', async () => {
    const { controller } = make(new ScriptedFarmLink(), 'waiting_for_owner');
    const snap = controller.snapshot();
    expect(snap.connection.controllerReady).toBe(false);
    expect(snap.connection.ownership).toBe('waiting_for_owner');
    await expect(controller.command({ type: 'fan.set', on: true }, crypto.randomUUID())).rejects.toBeInstanceOf(
      CommandPolicyError,
    );
  });

  it('T079 drain pauses automations and rejects new mutations', async () => {
    const { controller, link } = make();
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    controller.startAutomations();
    await controller.drain();
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(false);
    await expect(controller.command({ type: 'fan.set', on: true }, crypto.randomUUID())).rejects.toMatchObject({
      code: 'CONTROLLER_UNAVAILABLE',
    });
  });
});
