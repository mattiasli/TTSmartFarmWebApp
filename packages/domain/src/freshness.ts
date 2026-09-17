import { FRESH_MS } from '@smartfarm/contracts';

export function isFresh(ageMs: number | null | undefined, limitMs = FRESH_MS): boolean {
  return typeof ageMs === 'number' && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < limitMs;
}

export function telemetryAgeMs(receivedAtMs: number, nowMs: number): number {
  return Math.max(0, nowMs - receivedAtMs);
}
