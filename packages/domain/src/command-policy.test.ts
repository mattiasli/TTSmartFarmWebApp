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

  it('blocks a pulse while rain avoidance is active', () => {
    expect(() =>
      assertCommandPolicy({
        ...base,
        telemetry: { ...HEALTHY_TELEMETRY_FIXTURE, rain: 1 },
        rainRuleEnabled: true,
        request: { type: 'pump.pulse' },
      }),
    ).toThrow(/RAIN_BLOCKED|rain/i);
  });

  it('blocks another pulse while a previous pulse is unresolved', () => {
    expect(() =>
      assertCommandPolicy({ ...base, unresolvedPump: true, request: { type: 'pump.pulse' } }),
    ).toThrow(/PUMP_UNCERTAIN|unresolved/i);
  });

  it('does not buffer starts or stops when the broker is disconnected', () => {
    expect(() =>
      assertCommandPolicy({ ...base, brokerReady: false, request: { type: 'fan.set', on: true } }),
    ).toThrow(/BROKER_UNAVAILABLE|MQTT/i);
    expect(() =>
      assertCommandPolicy({ ...base, brokerReady: false, request: { type: 'farm.allOff' } }),
    ).toThrow(/BROKER_UNAVAILABLE|disconnected/i);
  });
});
