import { z } from 'zod';
import { LOCAL_FARM_ID, LOCAL_FARM_NAME } from '@smartfarm/contracts';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  RELEASE_SHA: z.string().default('dev'),
  PUBLIC_APP_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  ALLOWED_BROWSER_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
  FARM_MODE: z.enum(['simulator', 'live']).default('simulator'),
  FARM_ID: z.string().uuid().default(LOCAL_FARM_ID),
  FARM_NAME: z.string().default(LOCAL_FARM_NAME),
  SIMULATOR_TRANSPORT: z.enum(['memory', 'mqtt']).default('memory'),
  SIMULATOR_MQTT_URL: z.string().default('mqtt://127.0.0.1:1883'),
  HIVEMQ_HOST: z.string().optional(),
  HIVEMQ_MQTT_TLS_PORT: z.coerce.number().int().min(1).max(65535).default(8883),
  HIVEMQ_USERNAME: z.string().optional(),
  HIVEMQ_PASSWORD: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PUBLIC_WS_URL: z.string().default('ws://127.0.0.1:3001/ws'),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  LIVE_COMMANDS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  LIVE_PUMP_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if ((env.APP_ENV ?? 'local') === 'production' && (env.FARM_MODE ?? 'simulator') === 'simulator') {
    throw new Error('Production cannot run in simulator mode.');
  }
  if ((env.APP_ENV ?? 'local') === 'production' && !env.GITHUB_OAUTH_CLIENT_ID) {
    throw new Error('Production requires GITHUB_OAUTH_CLIENT_ID.');
  }
  return schema.parse({
    NODE_ENV: env.NODE_ENV ?? 'development',
    APP_ENV: env.APP_ENV ?? 'local',
    PORT: env.PORT ?? '3001',
    HOST: env.HOST ?? '127.0.0.1',
    RELEASE_SHA: env.RELEASE_SHA || env.RAILWAY_GIT_COMMIT_SHA || 'dev',
    PUBLIC_APP_ORIGIN: env.PUBLIC_APP_ORIGIN ?? 'http://127.0.0.1:5173',
    ALLOWED_BROWSER_ORIGINS: env.ALLOWED_BROWSER_ORIGINS,
    FARM_MODE: env.FARM_MODE ?? 'simulator',
    FARM_ID: env.FARM_ID ?? LOCAL_FARM_ID,
    FARM_NAME: env.FARM_NAME ?? LOCAL_FARM_NAME,
    SIMULATOR_TRANSPORT: env.SIMULATOR_TRANSPORT ?? 'memory',
    SIMULATOR_MQTT_URL: env.SIMULATOR_MQTT_URL ?? 'mqtt://127.0.0.1:1883',
    HIVEMQ_HOST: env.HIVEMQ_HOST,
    HIVEMQ_MQTT_TLS_PORT: env.HIVEMQ_MQTT_TLS_PORT ?? '8883',
    HIVEMQ_USERNAME: env.HIVEMQ_USERNAME,
    HIVEMQ_PASSWORD: env.HIVEMQ_PASSWORD,
    DATABASE_URL: env.DATABASE_URL,
    PUBLIC_WS_URL: env.PUBLIC_WS_URL ?? 'ws://127.0.0.1:3001/ws',
    GITHUB_OAUTH_CLIENT_ID: env.GITHUB_OAUTH_CLIENT_ID,
    GITHUB_OAUTH_CLIENT_SECRET: env.GITHUB_OAUTH_CLIENT_SECRET,
    LIVE_COMMANDS_ENABLED: env.LIVE_COMMANDS_ENABLED ?? 'false',
    LIVE_PUMP_ENABLED: env.LIVE_PUMP_ENABLED ?? 'false',
  });
}

export function redactedConfig(config: AppConfig) {
  return {
    appEnv: config.APP_ENV,
    releaseSha: config.RELEASE_SHA,
    farmMode: config.FARM_MODE,
    liveCommandsEnabled: config.LIVE_COMMANDS_ENABLED,
    livePumpEnabled: config.LIVE_PUMP_ENABLED,
    publicAppOrigin: config.PUBLIC_APP_ORIGIN,
    simulatorTransport: config.SIMULATOR_TRANSPORT,
    databaseConfigured: Boolean(config.DATABASE_URL),
    githubOAuthConfigured: Boolean(config.GITHUB_OAUTH_CLIENT_ID),
  };
}
