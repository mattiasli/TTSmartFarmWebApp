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
      const client = new pg.Client({
        connectionString: this.databaseUrl,
        connectionTimeoutMillis: 2_000,
        query_timeout: 2_000,
      });
      this.client = client;
      // An idle PostgreSQL disconnect emits an error outside any query promise.
      // Fence this session immediately and let the controller retry a fresh one.
      const lost = () => {
        if (this.client !== client) return;
        this.client = null;
        this.held = false;
        void client.end().catch(() => undefined);
      };
      client.on('error', lost);
      client.on('end', lost);
      try {
        await client.connect();
      } catch (error) {
        lost();
        throw error;
      }
    }
    const client = this.client;
    if (!client) return false;
    try {
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [this.key],
      );
      this.held = this.client === client && result.rows[0]?.acquired === true;
      if (!this.held) await this.close();
      return this.held;
    } catch (error) {
      await this.close();
      throw error;
    }
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
    const client = this.client;
    try {
      await client.query('SELECT 1');
      return this.held && this.client === client;
    } catch {
      if (this.client === client) await this.close();
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
