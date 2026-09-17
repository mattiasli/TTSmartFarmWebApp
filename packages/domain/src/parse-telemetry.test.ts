import { HEALTHY_TELEMETRY_FIXTURE, LEGACY_TELEMETRY_FIXTURE } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { parseTelemetry, TelemetryParseError } from './parse-telemetry';

const packet = LEGACY_TELEMETRY_FIXTURE;

describe('parseTelemetry', () => {
  it('accepts all 22 current wire fields', () => {
    const parsed = parseTelemetry(JSON.stringify(HEALTHY_TELEMETRY_FIXTURE));
    expect(parsed.capability).toBe('guard');
    expect(parsed.data).toEqual(HEALTHY_TELEMETRY_FIXTURE);
  });

  it('accepts the original 18-field legacy packet', () => {
    const parsed = parseTelemetry(JSON.stringify(packet));
    expect(parsed.capability).toBe('legacy');
    expect(parsed.data).toEqual(packet);
  });

  it('rejects a partial guard extension', () => {
    expect(() => parseTelemetry(JSON.stringify({ ...packet, guard: 1 }))).toThrow(
      TelemetryParseError,
    );
  });

  it('rejects malformed, oversized, wrongly typed and out-of-range readings', () => {
    const oversized = 'x'.repeat(4097);
    for (const payload of [
      'not json',
      'null',
      '[]',
      oversized,
      JSON.stringify({ ...packet, fan: '1' }),
      JSON.stringify({ ...packet, rain: 3 }),
      JSON.stringify({ ...packet, light: 5000 }),
      JSON.stringify({ ...packet, h: -1 }),
    ]) {
      expect(() => parseTelemetry(payload)).toThrow();
    }
  });

  it('rejects incomplete core packets instead of filling zeros', () => {
    for (const key of Object.keys(packet) as (keyof typeof packet)[]) {
      const incomplete = { ...packet };
      delete incomplete[key];
      expect(() => parseTelemetry(JSON.stringify(incomplete))).toThrow();
    }
  });

  it('keeps failed DHT and ultrasonic sentinel values', () => {
    const failed = { ...packet, t: -99, h: -1, dht: 0 as const, dist: -1 };
    expect(parseTelemetry(JSON.stringify(failed)).data).toEqual(failed);
  });

  it('preserves a valid zero tank level', () => {
    const zero = { ...HEALTHY_TELEMETRY_FIXTURE, water: 0 };
    expect(parseTelemetry(JSON.stringify(zero)).data.water).toBe(0);
  });

  it('ignores unknown extra keys without using them as actuator inputs', () => {
    const parsed = parseTelemetry(JSON.stringify({ ...HEALTHY_TELEMETRY_FIXTURE, solar: 12 }));
    expect(parsed.unknownKeys).toEqual(['solar']);
    expect(parsed.data.fan).toBe(0);
  });

  it('rejects incomplete or invalid guard extensions', () => {
    const protectedPacket = { ...packet, guard: 1, tankLow: 20, tankRecover: 30, pumpBlocked: 1 };
    expect(parseTelemetry(JSON.stringify(protectedPacket)).data.pumpBlocked).toBe(1);
    for (const bad of [
      { guard: 1 },
      { ...protectedPacket, tankLow: 31 },
      { ...protectedPacket, pumpBlocked: 3 },
      { ...protectedPacket, tankRecover: '30' },
    ]) {
      expect(() => parseTelemetry(JSON.stringify({ ...packet, ...bad }))).toThrow(TelemetryParseError);
    }
  });
});
