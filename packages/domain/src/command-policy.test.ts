import { HEALTHY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { assertCommandPolicy, CommandPolicyError } from './command-policy';

const base = {
  mode: 'simulator' as const,
  liveCommandsEnabled: false,
  livePumpEnabled: false,
  controllerReady: true,
  brokerReady: true,
  telemetryAgeMs: 800,
  telemetry: HEALTHY_TELEMETRY_FIXTURE,
};

describe('assertCommandPolicy', () => {
  it('allows a simulator fan start when telemetry is fresh', () => {
    expect(() => assertCommandPolicy({ ...base, request: { type: 'fan.set', on: true } })).not.toThrow();
  });

  it('blocks starts on stale telemetry but allows stop', () => {
    expect(() =>
      assertCommandPolicy({ ...base, telemetryAgeMs: 4000, request: { type: 'fan.set', on: true } }),
    ).toThrow(CommandPolicyError);
    expect(() =>
      assertCommandPolicy({ ...base, telemetryAgeMs: 5000, request: { type: 'farm.allOff' } }),
    ).not.toThrow();
  });

  it('blocks a live pulse when pumping is disabled', () => {
    expect(() =>
      assertCommandPolicy({
        ...base,
        mode: 'live',
        liveCommandsEnabled: true,
        livePumpEnabled: false,
        request: { type: 'pump.pulse' },
      }),
    ).toThrow(/LIVE_PUMP_DISABLED|disabled/i);
  });
});
