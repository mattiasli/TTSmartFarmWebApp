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

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`API draining after ${signal}.`);
  // Leave room inside Railway's configured 15-second draining window.
  const deadline = setTimeout(() => {
    console.error('API shutdown exceeded its 12-second deadline.');
    process.exit(1);
  }, 12_000);
  deadline.unref();
  void app.close().then(
    () => {
      clearTimeout(deadline);
      console.log('API shutdown complete.');
      process.exit(0);
    },
    () => {
      console.error('API shutdown failed.');
      process.exit(1);
    },
  );
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
