import { describe, expect, it } from 'vitest';
import { QueryWindowError } from './errors';
import { MAX_HISTORY_POINTS, assertHistoryQueryWindow } from './history-window';

describe('history query window', () => {
  it('T091 rejects a range longer than 30 days', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-02T00:00:00Z');
    expect(() => assertHistoryQueryWindow(from, to)).toThrow(QueryWindowError);
  });

  it('T091 rejects a window that would exceed 2000 buckets', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + MAX_HISTORY_POINTS * 10_000 + 60_000);
    expect(() => assertHistoryQueryWindow(from, to, 10)).toThrow(QueryWindowError);
  });

  it('accepts a one-hour window at 60-second buckets', () => {
    const to = new Date('2026-01-01T01:00:00Z');
    const from = new Date('2026-01-01T00:00:00Z');
    expect(assertHistoryQueryWindow(from, to, 60).estimated).toBe(60);
  });
});
