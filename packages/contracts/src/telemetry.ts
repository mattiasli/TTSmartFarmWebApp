import { z } from 'zod';

export const TELEMETRY_TOPIC = 'smartfarm/telemetry';
export const COMMAND_TOPIC_PREFIX = 'smartfarm/cmd/';
export const TELEMETRY_MAX_BYTES = 4096;
export const FRESH_MS = 4000;

export const CORE_TELEMETRY_KEYS = [
  't',
  'h',
  'dht',
  'soil',
  'water',
  'light',
  'steam',
  'rain',
  'dist',
  'pir',
  'btn',
  'rssi',
  'fan',
  'led',
  'feed',
  'pump',
  'buzz',
  'bl',
] as const;

export const FLAG_KEYS = [
  'dht',
  'rain',
  'pir',
  'btn',
  'fan',
  'led',
  'feed',
  'pump',
  'buzz',
  'bl',
] as const;

export const GUARD_KEYS = ['guard', 'tankLow', 'tankRecover', 'pumpBlocked'] as const;

export const flagSchema = z.union([z.literal(0), z.literal(1)]);

export const coreTelemetrySchema = z.object({
  t: z.number().finite(),
  h: z.number().finite(),
  dht: flagSchema,
  soil: z.number().finite().min(0).max(100),
  water: z.number().finite().min(0).max(100),
  light: z.number().finite().min(0).max(4095),
  steam: z.number().finite().min(0).max(4095),
  rain: flagSchema,
  dist: z.number().finite().min(-1).max(1000),
  pir: flagSchema,
  btn: flagSchema,
  rssi: z.number().finite().min(-150).max(0),
  fan: flagSchema,
  led: flagSchema,
  feed: flagSchema,
  pump: flagSchema,
  buzz: flagSchema,
  bl: flagSchema,
});

export const guardTelemetrySchema = z.object({
  guard: z.literal(1),
  tankLow: z.number().int().min(1).max(90),
  tankRecover: z.number().int().min(2).max(100),
  pumpBlocked: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

export type CoreTelemetry = z.infer<typeof coreTelemetrySchema>;
export type GuardTelemetry = z.infer<typeof guardTelemetrySchema>;
export type WireTelemetry = CoreTelemetry & Partial<GuardTelemetry>;

export type PumpBlockReason = 'ready' | 'low_tank' | 'no_valid_sample';

export function pumpBlockReason(code: 0 | 1 | 2): PumpBlockReason {
  if (code === 1) return 'low_tank';
  if (code === 2) return 'no_valid_sample';
  return 'ready';
}

export const HEALTHY_TELEMETRY_FIXTURE: WireTelemetry = {
  t: 24,
  h: 45,
  dht: 1,
  soil: 38,
  water: 65,
  light: 2559,
  steam: 300,
  rain: 0,
  dist: 12.4,
  pir: 0,
  btn: 0,
  rssi: -57,
  fan: 0,
  led: 0,
  feed: 0,
  pump: 0,
  buzz: 0,
  bl: 1,
  guard: 1,
  tankLow: 20,
  tankRecover: 30,
  pumpBlocked: 0,
};

export const LEGACY_TELEMETRY_FIXTURE: CoreTelemetry = {
  t: 24,
  h: 40,
  dht: 1,
  soil: 12,
  water: 55,
  light: 1234,
  steam: 200,
  rain: 0,
  dist: 15,
  pir: 0,
  btn: 0,
  rssi: -60,
  fan: 0,
  led: 1,
  feed: 0,
  pump: 0,
  buzz: 0,
  bl: 1,
};
