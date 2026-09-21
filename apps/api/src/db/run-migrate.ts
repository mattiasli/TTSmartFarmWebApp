import { loadConfig } from '../config';
import { migrate } from './migrate';
import { createPool } from './pool';
import { seedLocal } from './seed';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.log('No DATABASE_URL set. Start Postgres or leave the API on in-memory stores.');
  process.exit(0);
}
await migrate(config.DATABASE_URL);
const pool = createPool(config.DATABASE_URL, 2);
try {
  await seedLocal(pool, { farmId: config.FARM_ID, farmName: config.FARM_NAME, environment: config.APP_ENV });
} finally {
  await pool.end();
}
console.log('Migrations and configured farm seed applied.');
