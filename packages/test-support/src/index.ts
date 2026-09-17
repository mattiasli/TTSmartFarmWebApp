import { HEALTHY_TELEMETRY_FIXTURE, type WireTelemetry } from '@smartfarm/contracts';

export function telemetryFixture(overrides: Partial<WireTelemetry> = {}): WireTelemetry {
  return { ...HEALTHY_TELEMETRY_FIXTURE, ...overrides };
}

export function createFakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
      return now;
    },
  };
}
