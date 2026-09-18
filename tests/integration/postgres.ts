import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { LOCAL_DATABASE_URL, createPool, migrate, seedLocal } from '../../apps/api/src/db';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/api/migrations',
);

export function adminDatabaseUrl() {
  return process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
}

function databaseUrlFor(name: string) {
  return adminDatabaseUrl().replace(/\/[^/]+(?:\?.*)?$/, `/${name}`);
}

export async function databaseAvailable() {
  const client = new pg.Client({
    connectionString: adminDatabaseUrl(),
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function createEmptyDatabase(name: string) {
  const admin = new pg.Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  return databaseUrlFor(name);
}

export async function dropDatabase(name: string) {
  const admin = new pg.Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

export async function createIsolatedDatabase() {
  const name = `sf_p05_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const url = await createEmptyDatabase(name);
  await migrate(url);
  const pool = createPool(url, 4);
  await seedLocal(pool);
  return {
    name,
    url,
    pool,
    async close() {
      await pool.end();
      await dropDatabase(name);
    },
  };
}

export async function createInitOnlyDatabase() {
  const name = `sf_p05_init_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const url = await createEmptyDatabase(name);
  const sql = await readFile(path.join(migrationsDir, '001_init.sql'), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [
      '001_init.sql',
      checksum,
    ]);
  } finally {
    await client.end();
  }
  return {
    name,
    url,
    async close() {
      await dropDatabase(name);
    },
  };
}
