import { expect, it } from 'vitest';
import { automationSettingsSchema, DEFAULT_AUTOMATIONS } from '../../packages/contracts/src/automations.ts';
import { coolingThresholds, supervisedAutomationWindow } from './supervised-automation-window.mjs';
import { AutomationEngine } from '../../packages/domain/src/engine.ts';
import { HEALTHY_TELEMETRY_FIXTURE } from '../../packages/contracts/src/telemetry.ts';

it('runs cooling with unmatched existing guard values without publishing pump or guard commands', () => {
  const calls = [];
  const engine = new AutomationEngine({ settings: DEFAULT_AUTOMATIONS,
    clock: () => 0, send: (control, payload) => { calls.push({ control, payload }); } });
  const telemetry = { ...HEALTHY_TELEMETRY_FIXTURE, t: 24, tankLow: 8, tankRecover: 10 };
  engine.sample(telemetry); engine.tick(true);
  const base = { ...DEFAULT_AUTOMATIONS, irrigation: false, alarm: false, rain: false, lighting: false, cooling: true };
  engine.configure({ ...base, ...coolingThresholds(24).on }); engine.start();
  engine.sample({ ...telemetry, fan: 1 });
  engine.configure({ ...base, ...coolingThresholds(24).off });
  engine.sample({ ...telemetry, fan: 0 }); engine.pause(); engine.configure(DEFAULT_AUTOMATIONS);
  expect(calls.every(({ control }) => control === 'fan')).toBe(true);
  expect(calls).toContainEqual({ control: 'fan', payload: 'on' });
  expect(calls).toContainEqual({ control: 'fan', payload: 'off' });
  expect(engine.settings.tankLow).toBe(20); expect(engine.settings.tankRecover).toBe(30);
  expect(engine.data.tankLow).toBe(8); expect(engine.data.tankRecover).toBe(10);
});

it('creates valid cooling thresholds around the measured temperature without changing guard values', () => {
  for (const temperature of [14, 23, 23.5, 44]) {
    const ranges = coolingThresholds(temperature);
    expect(temperature).toBeGreaterThan(ranges.on.fanOn);
    expect(temperature).toBeLessThan(ranges.off.fanOff);
    expect(temperature).toBeGreaterThan(ranges.band.fanOff);
    expect(temperature).toBeLessThan(ranges.band.fanOn);
    for (const thresholds of Object.values(ranges)) {
      expect(automationSettingsSchema.safeParse({ ...DEFAULT_AUTOMATIONS, ...thresholds }).success).toBe(true);
      expect(Object.keys(thresholds).sort()).toEqual(['fanOff', 'fanOn']);
    }
  }
  for (const temperature of [-99, NaN, Infinity, 13.9, 44.1]) expect(() => coolingThresholds(temperature)).toThrow();
});

for (const failures of [[], ['enable'], ['run'], ['pause'], ['stop'], ['restoreSettings'], ['disable'],
  ['run', 'pause', 'stop', 'restoreSettings', 'disable']]) {
  it(`attempts every cleanup after ${failures.join(', ') || 'success'}`, async () => {
    const calls = [];
    const hooks = Object.fromEntries(['enable', 'run', 'pause', 'stop', 'restoreSettings', 'disable'].map((name) =>
      [name, async () => { calls.push(name); if (failures.includes(name)) throw new Error(name); }]));
    const result = supervisedAutomationWindow(hooks);
    if (failures.length) await expect(result).rejects.toThrow(AggregateError); else await result;
    expect(calls.slice(-4)).toEqual(['pause', 'stop', 'restoreSettings', 'disable']);
    expect(calls.includes('run')).toBe(!failures.includes('enable'));
  });
}
