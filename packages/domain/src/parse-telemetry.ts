import {
  CORE_TELEMETRY_KEYS,
  FLAG_KEYS,
  GUARD_KEYS,
  TELEMETRY_MAX_BYTES,
  coreTelemetrySchema,
  guardTelemetrySchema,
  type WireTelemetry,
} from '@smartfarm/contracts';

export class TelemetryParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TelemetryParseError';
    this.code = code;
  }
}

export type ParsedTelemetry = {
  data: WireTelemetry;
  capability: 'legacy' | 'guard';
  unknownKeys: string[];
};

function asObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TelemetryParseError('invalid_shape', 'Invalid telemetry.');
  }
  return payload as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TelemetryParseError('invalid_field', `Missing or invalid sensor: ${key}`);
  }
  return value;
}

export function parseTelemetry(payload: string | Uint8Array): ParsedTelemetry {
  const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
  if (new TextEncoder().encode(text).length > TELEMETRY_MAX_BYTES) {
    throw new TelemetryParseError('too_large', 'Telemetry is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TelemetryParseError('invalid_json', 'Invalid telemetry.');
  }

  const raw = asObject(parsed);
  const core: Record<string, number> = {};
  for (const key of CORE_TELEMETRY_KEYS) {
    core[key] = assertFiniteNumber(raw[key], key);
  }

  for (const key of FLAG_KEYS) {
    const value = core[key];
    if (value !== 0 && value !== 1) {
      throw new TelemetryParseError('invalid_flag', `Invalid state: ${key}`);
    }
  }

  const coreResult = coreTelemetrySchema.safeParse(core);
  if (!coreResult.success) {
    const issue = coreResult.error.issues[0];
    const key = issue?.path[0] ? String(issue.path[0]) : 'telemetry';
    if (key === 'light' || key === 'steam') {
      throw new TelemetryParseError('invalid_adc', `Invalid ADC: ${key}`);
    }
    if (key === 'soil' || key === 'water') {
      throw new TelemetryParseError('invalid_percent', `Invalid percentage: ${key}`);
    }
    if (key === 'dist' || key === 'rssi') {
      throw new TelemetryParseError('invalid_range', 'Invalid distance or signal.');
    }
    throw new TelemetryParseError('invalid_field', issue?.message ?? 'Invalid telemetry.');
  }

  if (coreResult.data.dht === 1) {
    if (
      coreResult.data.t < -40 ||
      coreResult.data.t > 125 ||
      coreResult.data.h < 0 ||
      coreResult.data.h > 100
    ) {
      throw new TelemetryParseError('invalid_dht', 'Invalid DHT reading.');
    }
  }

  const hasAnyGuard = GUARD_KEYS.some((key) => Object.hasOwn(raw, key));
  const result: WireTelemetry = { ...coreResult.data };
  let capability: 'legacy' | 'guard' = 'legacy';

  if (hasAnyGuard) {
    const guardRaw = {
      guard: raw.guard,
      tankLow: raw.tankLow,
      tankRecover: raw.tankRecover,
      pumpBlocked: raw.pumpBlocked,
    };
    const guardResult = guardTelemetrySchema.safeParse(guardRaw);
    if (!guardResult.success) {
      throw new TelemetryParseError('invalid_guard', 'Invalid pump protection telemetry.');
    }
    if (guardResult.data.tankRecover <= guardResult.data.tankLow) {
      throw new TelemetryParseError('invalid_guard', 'Invalid pump protection telemetry.');
    }
    Object.assign(result, guardResult.data);
    capability = 'guard';
  }

  const known = new Set<string>([...CORE_TELEMETRY_KEYS, ...GUARD_KEYS]);
  const unknownKeys = Object.keys(raw).filter((key) => !known.has(key));
  return { data: result, capability, unknownKeys };
}
