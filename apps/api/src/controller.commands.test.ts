import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';
import { FarmController } from './controller';
import { IdempotencyConflictError } from './db/errors';
import { ScriptedFarmLink } from './farm-link';

describe('P08 command confirmation', () => {
  const controllers: FarmController[] = [];
  afterEach(async () => {
    while (controllers.length) await controllers.pop()?.close();
    vi.useRealTimers();
  });

  function make(now = Date.now()) {
    const link = new ScriptedFarmLink();
    link.inject(HEALTHY_TELEMETRY_FIXTURE, now);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => now,
      null,
      { ownership: 'owner' },
    );
    controllers.push(controller);
    controller.snapshot();
    return { controller, link };
  }

  async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for command state.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('T017/T019 returns the same command for a duplicate idempotency key', async () => {
    const { controller } = make();
    const key = crypto.randomUUID();
    const first = await controller.command({ type: 'fan.set', on: true }, key);
    const second = await controller.command({ type: 'fan.set', on: true }, key);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe(first.status);
  });

  it('T018 rejects the same key with a different body', async () => {
    const { controller } = make();
    const key = crypto.randomUUID();
    await controller.command({ type: 'fan.set', on: true }, key);
    await expect(controller.command({ type: 'fan.set', on: false }, key)).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
  });

  it('T021/T022 matches only a newer packet after publish', async () => {
    const now = Date.now();
    const { controller, link } = make(now);
    const command = await controller.command({ type: 'fan.set', on: true }, crypto.randomUUID());
    expect(command.status).toBe('sent');
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, fan: 1 }, now - 10);
    controller.snapshot();
    expect(controller.getCommand(command.id)?.status).toBe('sent');
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, fan: 1 }, now + 10);
    const matched = controller.snapshot().pendingCommands.find((row) => row.id === command.id);
    expect(controller.getCommand(command.id)?.status).toBe('state_matched');
    expect(matched).toBeUndefined();
  });

  it('T023/T024 leaves beep and LCD at sent', async () => {
    const { controller } = make();
    const beep = await controller.command({ type: 'buzzer.beep', frequencyHz: 880 }, crypto.randomUUID());
    const lcd = await controller.command({ type: 'lcd.setText', line1: 'Hello', line2: 'Farm' }, crypto.randomUUID());
    expect(beep.status).toBe('sent');
    expect(beep.confirmationMode).toBe('not_reported');
    expect(lcd.status).toBe('sent');
    expect(lcd.confirmationMode).toBe('not_reported');
    expect(controller.snapshot().pendingCommands.some((command) => [beep.id, lcd.id].includes(command.id))).toBe(false);
    const again = await controller.command({ type: 'buzzer.beep', frequencyHz: 440 }, crypto.randomUUID());
    const nextText = await controller.command({ type: 'lcd.setText', line1: 'Next', line2: 'Text' }, crypto.randomUUID());
    expect(again.status).toBe('sent');
    expect(nextText.status).toBe('sent');
  });

  it('matches backlight telemetry before accepting the next backlight change', async () => {
    const now = Date.now();
    const { controller, link } = make(now);
    const first = await controller.command({ type: 'lcd.setBacklight', on: true }, crypto.randomUUID());
    expect(first.confirmationMode).toBe('state_match');
    await expect(controller.command({ type: 'lcd.setBacklight', on: false }, crypto.randomUUID())).rejects.toMatchObject({ code: 'ACTUATOR_BUSY' });
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, bl: 1 }, now + 1);
    controller.snapshot();
    expect(controller.getCommand(first.id)?.status).toBe('state_matched');
    await expect(controller.command({ type: 'lcd.setBacklight', on: false }, crypto.randomUUID())).resolves.toMatchObject({ status: 'sent' });
  });

  it('T025/T027 stop supersedes a pending start and ignores the late callback', async () => {
    const { controller, link } = make();
    link.deferPublishes = true;
    const startPromise = controller.command({ type: 'fan.set', on: true }, crypto.randomUUID());
    await waitUntil(() => link.waiting > 0);
    const stopPromise = controller.command({ type: 'farm.allOff' }, crypto.randomUUID());
    await waitUntil(() => !controller.snapshot().pendingCommands.some((row) => row.action === 'fan.set'));
    link.releasePublishes();
    const [start, stop] = await Promise.all([startPromise, stopPromise]);
    expect(start.status).toBe('superseded');
    expect(stop.status).toBe('sent');
    expect(link.published.some((row) => row.topic.endsWith('/fan') && row.payload === 'on')).toBe(false);
    expect(link.published.some((row) => row.topic.endsWith('/all') && row.payload === 'off')).toBe(true);
  });

  it('T026 all-off publishes after a pulse and does not queue another start', async () => {
    const { controller, link } = make();
    const pulse = await controller.command({ type: 'pump.pulse' }, crypto.randomUUID());
    const stop = await controller.command({ type: 'farm.allOff' }, crypto.randomUUID());
    expect(pulse.status).toBe('sent');
    expect(stop.status).toBe('sent');
    expect(link.published.filter((row) => row.topic.endsWith('/pump') && row.payload === 'pulse')).toHaveLength(1);
    expect(link.published.some((row) => row.topic.endsWith('/all') && row.payload === 'off')).toBe(true);
  });

  it('T028 does not queue a command while the broker is offline', async () => {
    const { controller, link } = make();
    link.disconnect();
    await expect(controller.command({ type: 'fan.set', on: true }, crypto.randomUUID())).rejects.toThrow(
      /BROKER_UNAVAILABLE|not ready/i,
    );
    expect(link.published).toHaveLength(0);
  });

  it('T106 unresolved pulse watchdog blocks a later pulse', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const { controller } = make(now);
    const pulse = await controller.command({ type: 'pump.pulse' }, crypto.randomUUID());
    expect(pulse.status).toBe('sent');
    await vi.advanceTimersByTimeAsync(8500);
    expect(controller.getCommand(pulse.id)?.status).toBe('uncertain');
    await expect(controller.command({ type: 'pump.pulse' }, crypto.randomUUID())).rejects.toThrow(
      /PUMP_UNCERTAIN|unresolved/i,
    );
  });

  it('T103/T104/T105 rain and live-pump flags block pulses; stale stop is allowed', async () => {
    const { controller, link } = make();
    link.inject({ ...HEALTHY_TELEMETRY_FIXTURE, rain: 1 });
    await expect(controller.command({ type: 'pump.pulse' }, crypto.randomUUID())).rejects.toThrow(/RAIN_BLOCKED|rain/i);
    const live = new FarmController(
      loadConfig({
        NODE_ENV: 'test',
        APP_ENV: 'local',
        FARM_MODE: 'live',
        LIVE_COMMANDS_ENABLED: 'true',
        LIVE_PUMP_ENABLED: 'false',
      }),
      link,
      () => Date.now(),
      null,
      { ownership: 'owner' },
    );
    controllers.push(live);
    link.inject(HEALTHY_TELEMETRY_FIXTURE);
    await expect(live.command({ type: 'pump.pulse' }, crypto.randomUUID())).rejects.toMatchObject({
      code: 'LIVE_PUMP_DISABLED',
    });
    link.inject(HEALTHY_TELEMETRY_FIXTURE, Date.now() - 5000);
    const stop = await controller.command({ type: 'pump.stop' }, crypto.randomUUID());
    expect(stop.status).toBe('sent');
  });
});
