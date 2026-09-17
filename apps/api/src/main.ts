import { buildApp } from './app';
import { loadConfig } from './config';
import { migrate } from './db/migrate';

const config = loadConfig();
if (config.DATABASE_URL) {
  await migrate(config.DATABASE_URL);
  console.log('Database migrations applied.');
} else {
  console.log('No DATABASE_URL; using in-memory session/command stores.');
}

const app = await buildApp(config);
const host = config.APP_ENV === 'local' ? config.HOST : '0.0.0.0';
await app.listen({ host, port: config.PORT });
console.log(`API listening on http://${host}:${config.PORT} (${config.SIMULATOR_TRANSPORT} farm link)`);
