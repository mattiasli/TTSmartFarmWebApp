import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseMaintenance } from './maintenance';

afterEach(() => vi.useRealTimers());
describe('database maintenance scheduling', () => {
  it('drains multiple bounded retention batches daily and sweeps auth each minute', async () => {
    vi.useFakeTimers();
    const store = {
      sweepExpiredAuth: vi.fn().mockResolvedValue({ oauth: 1, tickets: 2, sessions: 0 }),
      purgeRetention: vi.fn().mockResolvedValueOnce({ samples: 1000, events: 0, commands: 0 })
        .mockResolvedValue({ samples: 5, events: 2, commands: 1 }),
    };
    const maintenance = new DatabaseMaintenance(store, vi.fn());
    maintenance.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(maintenance.status().lastRetention?.rows).toEqual({ samples: 1005, events: 2, commands: 1 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.sweepExpiredAuth).toHaveBeenCalledTimes(2);
    expect(store.purgeRetention).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(store.purgeRetention).toHaveBeenCalledTimes(3);
    await maintenance.close();
    const calls = store.sweepExpiredAuth.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.sweepExpiredAuth).toHaveBeenCalledTimes(calls);
  });

  it('does not overlap a slow auth sweep and retries errors without logging private details', async () => {
    vi.useFakeTimers();
    let finish!: (rows: { oauth: number; tickets: number; sessions: number }) => void;
    const store = {
      sweepExpiredAuth: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
        .mockResolvedValue({ oauth: 0, tickets: 0, sessions: 0 }),
      purgeRetention: vi.fn().mockRejectedValueOnce(new Error('private connection detail'))
        .mockResolvedValue({ samples: 0, events: 0, commands: 0 }),
    };
    const report = vi.fn();
    const maintenance = new DatabaseMaintenance(store, report);
    maintenance.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.sweepExpiredAuth).toHaveBeenCalledTimes(1);
    expect(store.purgeRetention).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(report.mock.calls)).not.toContain('private connection detail');
    finish({ oauth: 0, tickets: 0, sessions: 0 });
    await maintenance.close();
  });
});
