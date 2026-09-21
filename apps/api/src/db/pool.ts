import pg from 'pg';

export const LOCAL_DATABASE_URL = 'postgres://smartfarm:smartfarm@127.0.0.1:5432/smartfarm';
export const MIGRATION_LOCK_KEY = 737001;

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function createPool(databaseUrl: string, max = 10) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
  // Idle disconnects are emitted outside query promises; pg removes the broken
  // client automatically. Never log the error's attached credential-bearing client.
  pool.on('error', () => console.warn('Database pool connection lost; reconnecting on demand.'));
  return pool;
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error is the one callers need.
    }
    throw error;
  } finally {
    client.release();
  }
}
