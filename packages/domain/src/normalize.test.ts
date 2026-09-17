import { HEALTHY_TELEMETRY_FIXTURE, LEGACY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeTelemetry } from './normalize';

describe('normalizeTelemetry', () => {
  it('does not display DHT sentinels as real readings', () => {
    const failed = { ...LEGACY_TELEMETRY_FIXTURE, dht: 0 as const, t: -99, h: -1, dist: -1 };
    const dto = normalizeTelemetry(failed);
    expect(dto.temperatureC).toBeNull();
    expect(dto.humidityPct).toBeNull();
    expect(dto.distanceCm).toBeNull();
    expect(dto.dhtHealthy).toBe(false);
  });

  it('keeps a valid zero tank level distinct from unknown', () => {
    const dto = normalizeTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, water: 0 });
    expect(dto.waterPct).toBe(0);
    expect(dto.guard).toBe(true);
  });
});
