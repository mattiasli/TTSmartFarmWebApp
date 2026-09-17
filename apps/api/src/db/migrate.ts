import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { LOCAL_FARM_ID, LOCAL_FARM_NAME } from '@smartfarm/contracts';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function migrate(databaseUrl: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [file, checksum],
      );
    }
    await client.query(
      `INSERT INTO farms(id, name, environment, controller_lock_key)
       VALUES ($1, $2, 'local', 1)
       ON CONFLICT (id) DO NOTHING`,
      [LOCAL_FARM_ID, LOCAL_FARM_NAME],
    );
  } finally {
    await client.end();
  }
}
