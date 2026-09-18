import {
  DEFAULT_AUTOMATIONS,
  HEALTHY_TELEMETRY_FIXTURE,
  type AutomationSettings,
  type WireTelemetry,
} from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { AutomationEngine } from './engine';
import { editAutomationSetting } from './settings';

const packet: WireTelemetry = {
  ...HEALTHY_TELEMETRY_FIXTURE,
  h: 50,
  soil: 60,
  water: 70,
  light: 3400,
  steam: 100,
  t: 24,
};

type Call = { control: string; payload: string; cleanup?: boolean };

function farm(
  settings: Partial<AutomationSettings> = {},
  sender?: (control: string, payload: string) => unknown,
  initial: WireTelemetry = packet,
) {
  let now = 0;
  let data: WireTelemetry = { ...initial };
  const calls: Call[] = [];
  const engine = new AutomationEngine({
    settings: { ...DEFAULT_AUTOMATIONS, ...settings },
    clock: () => now,
    send: (control, payload, options) => {
      calls.push({ control, payload, ...options });
      return sender?.(control, payload) as void;
    },
  });
  const step = (time: number, update: Partial<WireTelemetry> = {}, fresh = true) => {
    now = time;
    data = { ...data, ...update };
    engine.sample(data);
    engine.tick(fresh);
  };
  step(0);
  return {
    engine,
    calls,
    step,
    count: (control: string, payload: string) =>
      calls.filter((call) => call.control === control && call.payload === payload).length,
  };
}

describe('AutomationEngine', () => {
  it('starts paused and watering waits, pulses once, then waits from confirmed pump stop', () => {
    const f = farm();
    f.step(1000, { soil: 10 });
    expect(f.calls.length).toBe(0);
    f.engine.start();
    f.step(30000);
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(31000);
    expect(f.count('pump', 'pulse')).toBe(1);
    f.step(31500, { pump: 1 });
    f.step(33000);
    expect(f.count('pump', 'pulse')).toBe(1);
    f.step(35000, { pump: 0 });
    f.step(64999);
    expect(f.count('pump', 'pulse')).toBe(1);
    f.step(65000);
    expect(f.count('pump', 'pulse')).toBe(2);
  });

  it('stops an automatic pulse when soil becomes moist', () => {
    const f = farm();
    f.engine.start();
    f.step(31000, { soil: 10 });
    f.step(31500, { pump: 1 });
    f.step(32000, { soil: 35 });
    expect(f.count('pump', 'off')).toBe(1);
  });

  it('blocks watering on low tank until recovery', () => {
    const f = farm({ alarm: false });
    f.engine.start();
    f.step(30000, { soil: 10, water: 20, pumpBlocked: 1 });
    f.step(40000, { water: 25 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(41000, { water: 30, pumpBlocked: 0 });
    expect(f.count('pump', 'pulse')).toBe(1);
  });

  it('rain stops a pulse and delays the next start', () => {
    const f = farm();
    f.engine.start();
    f.step(30000, { soil: 10 });
    f.step(30500, { pump: 1 });
    f.step(31000, { rain: 1 });
    expect(f.count('pump', 'off')).toBe(1);
  });

  it('legacy firmware cannot start automatic irrigation but fan still works', () => {
    const { guard: _g, tankLow: _l, tankRecover: _r, pumpBlocked: _p, ...legacy } = packet;
    const f = farm({}, undefined, legacy);
    f.engine.start();
    f.step(30000, { soil: 10, t: 32 });
    expect(f.count('pump', 'pulse')).toBe(0);
    expect(f.count('fan', 'on')).toBe(1);
    expect(f.engine.snapshot().messages.irrigation).toMatch(/Upload/);
  });

  it('changed tank settings must be acknowledged before any pulse', () => {
    const f = farm();
    f.engine.configure({ ...DEFAULT_AUTOMATIONS, tankLow: 25, tankRecover: 35 });
    expect(f.count('pumpguard', '25,35')).toBe(1);
    f.engine.start();
    f.step(1000, { soil: 10 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(2000, { tankLow: 25, tankRecover: 35 });
    f.step(30000);
    expect(f.count('pump', 'pulse')).toBe(1);
  });

  it('lost pump acknowledgement never triggers another start', () => {
    const f = farm();
    f.engine.start();
    f.step(30000, { soil: 10 });
    f.step(35000);
    f.step(100000);
    expect(f.count('pump', 'pulse')).toBe(1);
    expect(f.count('pump', 'off')).toBe(1);
    expect(f.engine.snapshot().faults.irrigation).toBeTruthy();
  });

  it('fan uses hysteresis and ignores failed DHT sentinels', () => {
    const f = farm();
    f.engine.start();
    f.step(1000, { t: 29 });
    f.step(1500, { fan: 1, t: 28 });
    expect(f.count('fan', 'off')).toBe(0);
    f.step(2000, { dht: 0, t: -99 });
    expect(f.count('fan', 'off')).toBe(0);
    f.step(3000, { dht: 1, t: 27 });
    expect(f.count('fan', 'off')).toBe(1);
  });

  it('All off pauses the master and never reactivates rules', () => {
    const f = farm();
    f.engine.start();
    f.step(1000, { t: 32 });
    f.step(1500, { fan: 1 });
    f.engine.takeManual('all');
    f.step(4000, { fan: 0 });
    f.step(50000);
    expect(f.engine.enabled).toBe(false);
    expect(f.count('fan', 'on')).toBe(1);
  });

  it('stale telemetry pauses and reconnect requires an explicit start', () => {
    const f = farm();
    f.engine.start();
    f.step(30000, { soil: 10, t: 32 });
    f.engine.tick(false);
    expect(f.engine.enabled).toBe(false);
    f.step(60000, { pump: 0, fan: 0 });
    expect(f.count('pump', 'pulse')).toBe(1);
    f.engine.start();
    f.step(60500);
    expect(f.count('pump', 'pulse')).toBe(1);
  });

  it('light threshold changes immediately use the last fresh reading', () => {
    const f = farm();
    f.step(1000, { light: 2559 });
    f.engine.start();
    expect(f.count('led', 'on')).toBe(0);
    f.engine.configure({ ...DEFAULT_AUTOMATIONS, lightOn: 3380, lightOff: 3560 });
    expect(f.count('led', 'on')).toBe(1);
  });

  it('companion fan edits stay valid', () => {
    const settings = editAutomationSetting(DEFAULT_AUTOMATIONS, 'fanOn', 24);
    expect(settings.fanOn).toBe(24);
    expect(settings.fanOff).toBe(22);
  });

  it('T029–T033 pulses only with dry soil, recovered tank, and guard telemetry', () => {
    const f = farm();
    f.engine.start();
    f.step(31000, { soil: 40 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(31500, { soil: 10, water: 10, pumpBlocked: 1 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(32000, { water: 25, pumpBlocked: 0 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(33000, { water: 30 });
    expect(f.count('pump', 'pulse')).toBe(1);
  });

  it('T034–T038 cooldown, external pump, max attempts, and reset stay durable', () => {
    const f = farm({ maxPulses: 2, cooldown: 30 });
    f.engine.start();
    f.step(1000, { soil: 10, pump: 1 });
    f.step(2000, { pump: 0 });
    f.step(31999);
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(32000);
    expect(f.count('pump', 'pulse')).toBe(1);
    f.step(32500, { pump: 1 });
    f.step(34000, { pump: 0 });
    f.engine.configure({ ...DEFAULT_AUTOMATIONS, maxPulses: 2, cooldown: 15 });
    f.step(48000);
    expect(f.count('pump', 'pulse')).toBe(1);
    f.step(64000);
    expect(f.count('pump', 'pulse')).toBe(2);
    f.step(64500, { pump: 1 });
    f.step(66000, { pump: 0 });
    f.step(97000);
    expect(f.count('pump', 'pulse')).toBe(2);
    expect(f.engine.snapshot().faults.irrigation).toMatch(/Paused after 2/);
    expect(() => f.engine.resetWatering()).not.toThrow();
    f.step(127000);
    expect(f.count('pump', 'pulse')).toBe(3);
  });

  it('T039–T042 rain delay is continuous and opt-out affects rain only', () => {
    const f = farm({ rainDelay: 10 });
    f.engine.start();
    f.step(31000, { soil: 10, rain: 1 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(32000, { rain: 0 });
    f.step(40000);
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(42100);
    expect(f.count('pump', 'pulse')).toBe(1);
    const opted = farm({ rain: false });
    opted.engine.start();
    opted.step(31000, { soil: 10, rain: 1 });
    expect(opted.count('pump', 'pulse')).toBe(1);
    expect(opted.count('pump', 'off')).toBe(0);
  });

  it('T043–T046 alarm beeps on interval, defers LCD, and keeps the pump guard', () => {
    const f = farm({ beepInterval: 10, alarm: true });
    f.engine.start();
    f.step(1000, { water: 10, pumpBlocked: 1 });
    expect(f.count('lcd', 'TANK LOW|REFILL WATER')).toBe(1);
    expect(f.count('buzzer', '880')).toBe(1);
    f.step(9000);
    expect(f.count('buzzer', '880')).toBe(1);
    f.step(11000);
    expect(f.count('buzzer', '880')).toBe(2);
    expect(f.engine.rememberLcd('Hello|Farm')).toBe(true);
    f.engine.takeManual('backlight');
    f.step(12000, { water: 40, pumpBlocked: 0 });
    expect(f.count('lcd', 'Hello|Farm')).toBe(1);
    expect(f.count('backlight', 'off')).toBe(0);
    expect(f.engine.snapshot().guard).toBe(true);
  });

  it('T047–T050 stale guard echo does not confirm a new threshold pair', () => {
    const f = farm();
    f.engine.configure({ ...DEFAULT_AUTOMATIONS, tankLow: 25, tankRecover: 35 });
    f.engine.start();
    f.step(1000, { soil: 10, tankLow: 20, tankRecover: 30 });
    expect(f.count('pump', 'pulse')).toBe(0);
    f.step(2000, { tankLow: 25, tankRecover: 35 });
    f.step(31000);
    expect(f.count('pump', 'pulse')).toBe(1);
  });

  it('T051–T054 empty companion numbers stay editable and DHT failure does not cool', () => {
    expect(() => editAutomationSetting(DEFAULT_AUTOMATIONS, 'fanOn', Number.NaN as never)).toThrow();
    const f = farm();
    f.engine.start();
    f.step(1000, { t: 28 });
    expect(f.count('fan', 'on')).toBe(0);
    f.engine.configure({ ...DEFAULT_AUTOMATIONS, fanOn: 25, fanOff: 23 });
    expect(f.count('fan', 'on')).toBe(1);
  });

  it('T055–T058 motion hold uses server time and manual LED is not undone', () => {
    const f = farm({ motionOnly: true, motionSeconds: 15, lightOn: 3380, lightOff: 3560 });
    f.step(1000, { light: 2559, pir: 1, led: 0 });
    f.engine.start();
    expect(f.count('led', 'on')).toBe(1);
    f.step(16000, { pir: 0, led: 1 });
    expect(f.count('led', 'off')).toBe(1);
    f.engine.takeManual('led');
    f.step(20000, { light: 2559, pir: 1, led: 0 });
    expect(f.count('led', 'on')).toBe(1);
  });

  it('restored attempts and cooldown never auto-resume after restart', () => {
    const f = farm();
    f.engine.restorePersisted({ attempts: 2, cooldownUntilMs: 5000, lastPumpStopMs: 0 });
    f.step(1000, { soil: 10 });
    expect(f.engine.enabled).toBe(false);
    expect(f.count('pump', 'pulse')).toBe(0);
    f.engine.start();
    f.step(4000);
    expect(f.count('pump', 'pulse')).toBe(0);
  });
});
