import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { CommandPolicyError } from '@smartfarm/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';
import { FarmController } from './controller';
import { ScriptedFarmLink } from './farm-link';
import type { ControllerLock } from './db/lock';

describe('P07 controller lifecycle', () => {
  const controllers: FarmController[] = [];
  afterEach(async () => {
    while (controllers.length) await controllers.pop()?.close();
    vi.useRealTimers();
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

  it('T078 retries ownership after the prior owner releases it, staying paused', async () => {
    vi.useFakeTimers();
    let available = false;
    const lock: ControllerLock = {
      key: 1, held: false,
      tryAcquire: vi.fn(async () => { lock.held = available; return available; }),
      release: async () => { lock.held = false; },
      isHealthy: async () => lock.held,
      close: async () => { lock.held = false; },
    };
    const controller = new FarmController(loadConfig({ NODE_ENV: 'test' }), new ScriptedFarmLink(), Date.now, null, { lock });
    controllers.push(controller);
    expect(await controller.becomeOwner()).toBe(false);
    available = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.ownership).toBe('owner');
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(false);
    expect(lock.tryAcquire).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(lock.tryAcquire).toHaveBeenCalledTimes(2);
  });

  it('T079 serializes ownership attempts and releases a lock acquired during shutdown', async () => {
    vi.useFakeTimers();
    let acquire!: (value: boolean) => void;
    const lock: ControllerLock = {
      key: 1, held: false,
      tryAcquire: vi.fn(() => new Promise<boolean>((resolve) => { acquire = resolve; })),
      release: vi.fn(async () => { lock.held = false; }),
      isHealthy: async () => lock.held,
      close: async () => { lock.held = false; },
    };
    const link = new ScriptedFarmLink();
    const controller = new FarmController(loadConfig({ NODE_ENV: 'test' }), link, Date.now, null, { lock });
    controllers.push(controller);
    const first = controller.becomeOwner();
    expect(controller.becomeOwner()).toBe(first);
    const closing = controller.close();
    lock.held = true;
    acquire(true);
    expect(await first).toBe(false);
    await closing;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(lock.held).toBe(false);
    expect(lock.tryAcquire).toHaveBeenCalledTimes(1);
    expect(link.published).toEqual([]);
  });

  it('never replays a held publish after lock loss and successful reacquisition', async () => {
    const lock: ControllerLock = {
      key: 1, held: true,
      tryAcquire: async () => { lock.held = true; return true; },
      release: async () => { lock.held = false; },
      isHealthy: async () => lock.held,
      close: async () => { lock.held = false; },
    };
    const link = new ScriptedFarmLink();
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    const controller = new FarmController(loadConfig({ NODE_ENV: 'test' }), link, Date.now, null, { lock, ownership: 'owner' });
    controllers.push(controller);
    link.deferPublishes = true;
    const command = controller.command({ type: 'fan.set', on: true }, crypto.randomUUID());
    const rejected = expect(command).rejects.toMatchObject({ code: 'CONTROLLER_UNAVAILABLE' });
    await expect.poll(() => link.waiting).toBeGreaterThan(0);
    lock.held = false;
    controller.snapshot();
    expect(await controller.becomeOwner()).toBe(true);
    link.releasePublishes();
    await rejected;
    expect(link.published).toEqual([]);
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(false);
  });

  it('T079 read-only live shutdown never publishes cleanup commands', async () => {
    const lock: ControllerLock = {
      key: 1, held: true, tryAcquire: async () => true,
      release: async () => { lock.held = false; },
      isHealthy: async () => true, close: async () => undefined,
    };
    const link = new ScriptedFarmLink();
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', FARM_MODE: 'live', LIVE_COMMANDS_ENABLED: 'false' }),
      link, Date.now, null, { lock, ownership: 'owner' },
    );
    controllers.push(controller);
    await controller.close();
    expect(link.published).toEqual([]);
    expect(lock.held).toBe(false);
  });

  it('read-only live mode exposes no control permission and rejects rule starts and guard synchronization', async () => {
    const link = new ScriptedFarmLink();
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    const controller = new FarmController(loadConfig({ NODE_ENV: 'test', FARM_MODE: 'live', LIVE_COMMANDS_ENABLED: 'false' }), link);
    controllers.push(controller);
    expect(controller.snapshot().permissions.canControl).toBe(false);
    expect(() => controller.startAutomations()).toThrow('Live commands are disabled');
    expect(() => controller.resumeRule('cooling')).toThrow('Live commands are disabled');
    expect(() => controller.syncGuard()).toThrow('Live commands are disabled');
    await expect(controller.command({ type: 'fan.set', on: true }, crypto.randomUUID()))
      .rejects.toMatchObject({ code: 'LIVE_COMMANDS_DISABLED' });
    expect(controller.snapshot().automations.runtime.masterEnabled).toBe(false);
    expect(link.published).toEqual([]);
  });

  it('T079 bounds drain and ignores a late ownership health result', async () => {
    vi.useFakeTimers();
    let healthy!: (value: boolean) => void;
    const lock: ControllerLock = {
      key: 1, held: true, tryAcquire: async () => true,
      release: async () => { lock.held = false; },
      isHealthy: () => new Promise<boolean>((resolve) => { healthy = resolve; }),
      close: async () => undefined,
    };
    const link = new ScriptedFarmLink();
    const controller = new FarmController(loadConfig({ NODE_ENV: 'test' }), link, Date.now, null, { lock, ownership: 'owner' });
    controllers.push(controller);
    const drain = controller.drain();
    expect(controller.drain()).toBe(drain);
    await vi.advanceTimersByTimeAsync(2_500);
    await drain;
    healthy(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(link.published).toEqual([]);
  });
});
