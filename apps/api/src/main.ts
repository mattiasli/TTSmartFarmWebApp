import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = buildApp(config);

const host = config.APP_ENV === 'local' ? config.HOST : '0.0.0.0';
await app.listen({ host, port: config.PORT });
console.log(`API listening on http://${host}:${config.PORT}`);
