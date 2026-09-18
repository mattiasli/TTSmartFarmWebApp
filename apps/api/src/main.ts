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
const port = Number(process.env.PORT ?? config.PORT);
const host =
  config.NODE_ENV === 'production' || config.APP_ENV !== 'local' ? '0.0.0.0' : config.HOST;
await app.listen({ host, port });
console.log(`API listening on http://${host}:${port} (${config.SIMULATOR_TRANSPORT} farm link)`);
