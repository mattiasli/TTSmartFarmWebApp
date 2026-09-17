import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { SimulatedFarm } from './farm-model';

describe('SimulatedFarm', () => {
  it('caps a pump pulse and does not change backlight on all-off', () => {
    const farm = new SimulatedFarm({ ...HEALTHY_TELEMETRY_FIXTURE, bl: 1 });
    farm.applyCommand('smartfarm/cmd/pump', 'pulse', 0);
    expect(farm.snapshot().pump).toBe(1);
    farm.tick(4000);
    expect(farm.snapshot().pump).toBe(0);
    farm.applyCommand('smartfarm/cmd/all', 'off', 5000);
    expect(farm.snapshot().bl).toBe(1);
    expect(farm.snapshot().fan).toBe(0);
  });

  it('blocks pumping when the tank is low', () => {
    const farm = new SimulatedFarm({ ...HEALTHY_TELEMETRY_FIXTURE, water: 10, pumpBlocked: 1 });
    farm.applyCommand('smartfarm/cmd/pump', 'pulse', 0);
    expect(farm.snapshot().pump).toBe(0);
  });

  it('applies the empty-tank scenario before a pulse is attempted', () => {
    const farm = new SimulatedFarm();
    farm.applyScenario('empty-tank');
    expect(farm.snapshot().water).toBe(8);
    expect(farm.snapshot().pumpBlocked).toBe(1);
  });

  it('clears a short beep without requiring a later buzz=1 packet', () => {
    const farm = new SimulatedFarm();
    farm.applyCommand('smartfarm/cmd/buzzer', '880', 0);
    expect(farm.snapshot().buzz).toBe(1);
    farm.tick(400);
    expect(farm.snapshot().buzz).toBe(0);
  });
});
