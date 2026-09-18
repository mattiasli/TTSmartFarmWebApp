import pg from 'pg';

export type ControllerLock = {
  key: number;
  held: boolean;
  tryAcquire(): Promise<boolean>;
  release(): Promise<void>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
};

/**
 * Session-level advisory lock on a dedicated connection.
 * Never return this client to the ordinary pool while the lock is held.
 */
export class DedicatedControllerLock implements ControllerLock {
  held = false;
  private client: pg.Client | null = null;

  constructor(
    private readonly databaseUrl: string,
    readonly key: number,
  ) {}

  async tryAcquire(): Promise<boolean> {
    if (this.held && this.client) return true;
    if (!this.client) {
      this.client = new pg.Client({ connectionString: this.databaseUrl });
      await this.client.connect();
    }
    const result = await this.client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [this.key],
    );
    this.held = result.rows[0]?.acquired === true;
    if (!this.held) {
      await this.close();
    }
    return this.held;
  }

  async release(): Promise<void> {
    if (!this.client || !this.held) {
      await this.close();
      return;
    }
    try {
      await this.client.query('SELECT pg_advisory_unlock($1)', [this.key]);
    } finally {
      this.held = false;
      await this.close();
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.held || !this.client) return false;
    try {
      await this.client.query('SELECT 1');
      return true;
    } catch {
      this.held = false;
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    this.held = false;
    await client.end().catch(() => undefined);
  }
}
