import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import {
  confirmationModeFor,
  matchesExpectedState,
  sameCommandRequest,
  stopSupersedes,
} from './command-confirm';

describe('command confirmation', () => {
  it('marks LCD and beep as sent-only', () => {
    expect(confirmationModeFor('lcd.setText')).toBe('not_reported');
    expect(confirmationModeFor('buzzer.beep')).toBe('not_reported');
    expect(confirmationModeFor('fan.set')).toBe('state_match');
  });

  it('only matches newer expected actuator state', () => {
    expect(matchesExpectedState({ type: 'fan.set', on: true }, { ...HEALTHY_TELEMETRY_FIXTURE, fan: 1 })).toBe(true);
    expect(matchesExpectedState({ type: 'fan.set', on: true }, HEALTHY_TELEMETRY_FIXTURE)).toBe(false);
  });

  it('lets stop and all-off supersede pending starts', () => {
    expect(stopSupersedes('pump.stop', 'pump.pulse')).toBe(true);
    expect(stopSupersedes('farm.allOff', 'fan.set')).toBe(true);
    expect(stopSupersedes('pump.stop', 'fan.set')).toBe(false);
  });

  it('compares command bodies independently of key order', () => {
    expect(
      sameCommandRequest({ type: 'fan.set', on: true }, JSON.parse('{"on":true,"type":"fan.set"}')),
    ).toBe(true);
    expect(sameCommandRequest({ type: 'fan.set', on: true }, { type: 'fan.set', on: false })).toBe(false);
  });
});
