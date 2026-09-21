import type { FarmStore } from './store';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
type MaintenanceStore = Pick<FarmStore, 'sweepExpiredAuth' | 'purgeRetention'>;
type Result = { completedAt: string; rows: Record<string, number> };

/** Small SQL batches run independently of controller work and never overlap themselves. */
export class DatabaseMaintenance {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private authTask: Promise<void> | null = null;
  private retentionTask: Promise<void> | null = null;
  private nextRetentionAt = 0;
  private auth: Result | null = null;
  private retention: Result | null = null;
  private lastError: { job: string; code: string; at: string } | null = null;

  constructor(private readonly store: MaintenanceStore,
    private readonly report: (event: Record<string, unknown>) => void,
    private readonly now = () => Date.now()) {}

  start() {
    if (this.timer || this.stopped) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), MINUTE_MS);
    this.timer.unref?.();
  }

  status() {
    return { authIntervalMs: MINUTE_MS, retentionIntervalMs: DAY_MS,
      authRunning: Boolean(this.authTask), retentionRunning: Boolean(this.retentionTask),
      lastAuth: this.auth, lastRetention: this.retention, lastError: this.lastError };
  }

  private failed(job: string, error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    this.lastError = { job, code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'MAINTENANCE_FAILED',
      at: new Date(this.now()).toISOString() };
    this.report({ event: 'database_maintenance_failed', ...this.lastError });
  }

  private tick() {
    if (this.stopped) return;
    if (!this.authTask) {
      this.authTask = this.store.sweepExpiredAuth(new Date(this.now())).then((rows) => {
        this.auth = { completedAt: new Date(this.now()).toISOString(), rows };
        this.report({ event: 'database_auth_cleanup', ...this.auth });
      }).catch((error: unknown) => this.failed('auth', error)).finally(() => { this.authTask = null; });
    }
    if (!this.retentionTask && this.now() >= this.nextRetentionAt) {
      this.retentionTask = this.purge().catch((error: unknown) => this.failed('retention', error))
        .finally(() => { this.retentionTask = null; });
    }
  }

  private async purge() {
    const cutoffTime = new Date(this.now());
    const totals = { samples: 0, events: 0, commands: 0 };
    while (!this.stopped) {
      const rows = await this.store.purgeRetention(cutoffTime);
      for (const key of ['samples', 'events', 'commands'] as const) totals[key] += rows[key];
      if (Object.values(rows).every((count) => count < 1000)) {
        this.retention = { completedAt: new Date(this.now()).toISOString(), rows: totals };
        this.nextRetentionAt = this.now() + DAY_MS;
        this.report({ event: 'database_retention_cleanup', ...this.retention });
        return;
      }
      // Yield between bounded batches, including to the minute-based auth cleanup.
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async close() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.all([this.authTask, this.retentionTask]);
  }
}
