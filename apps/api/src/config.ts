import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_APP_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  FARM_MODE: z.enum(['simulator', 'live']).default('simulator'),
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
  return schema.parse({
    NODE_ENV: env.NODE_ENV ?? 'development',
    APP_ENV: env.APP_ENV ?? 'local',
    PORT: env.PORT ?? '3001',
    HOST: env.HOST ?? '127.0.0.1',
    PUBLIC_APP_ORIGIN: env.PUBLIC_APP_ORIGIN ?? 'http://127.0.0.1:5173',
    FARM_MODE: env.FARM_MODE ?? 'simulator',
    LIVE_COMMANDS_ENABLED: env.LIVE_COMMANDS_ENABLED ?? 'false',
    LIVE_PUMP_ENABLED: env.LIVE_PUMP_ENABLED ?? 'false',
  });
}

export function redactedConfig(config: AppConfig) {
  return {
    appEnv: config.APP_ENV,
    farmMode: config.FARM_MODE,
    liveCommandsEnabled: config.LIVE_COMMANDS_ENABLED,
    livePumpEnabled: config.LIVE_PUMP_ENABLED,
    publicAppOrigin: config.PUBLIC_APP_ORIGIN,
  };
}
