import { loadConfig } from '../config';
import { createPool } from './pool';
import { seedLocal } from './seed';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.log('No DATABASE_URL set. Start Postgres before seeding.');
  process.exit(0);
}
const pool = createPool(config.DATABASE_URL, 2);
try {
  await seedLocal(pool);
  console.log('Local farm seed applied.');
} finally {
  await pool.end();
}
