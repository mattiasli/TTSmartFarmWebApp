import { FRESH_MS } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { isFresh, telemetryAgeMs } from './freshness';

describe('freshness', () => {
  it('treats exactly 4000 ms as stale', () => {
    expect(isFresh(3999)).toBe(true);
    expect(isFresh(FRESH_MS)).toBe(false);
    expect(isFresh(null)).toBe(false);
  });

  it('measures age from receive time, not device timestamps', () => {
    expect(telemetryAgeMs(1000, 2500)).toBe(1500);
  });
});
