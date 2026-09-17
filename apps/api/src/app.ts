import Fastify from 'fastify';
import { loadConfig, redactedConfig, type AppConfig } from './config';

export function buildApp(config: AppConfig = loadConfig()) {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'warn',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'HIVEMQ_PASSWORD'],
    },
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({
    status: 'ready',
    controller: 'not_started',
    ...redactedConfig(config),
  }));

  return app;
}
