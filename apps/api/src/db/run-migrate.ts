import { loadConfig } from '../config';
import { migrate } from './migrate';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.log('No DATABASE_URL set. Start Postgres or leave the API on in-memory stores.');
  process.exit(0);
}
await migrate(config.DATABASE_URL);
console.log('Migrations and local farm seed applied.');
