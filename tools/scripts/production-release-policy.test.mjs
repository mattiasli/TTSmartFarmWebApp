import { expect, it } from 'vitest';
import { assertProductionVariables, assertReadOnlyProductionHealth, productionHostConfig } from './production-release-policy.mjs';

it('never accepts simulator, writable live mode, missing OAuth or another revision as read-only production', () => {
  const health = { appEnv: 'production', farmMode: 'live', liveCommandsEnabled: false,
    livePumpEnabled: false, controller: 'owner', databaseConfigured: true, githubOAuthConfigured: true, releaseSha: 'tested' };
  expect(() => assertReadOnlyProductionHealth(health, 'tested')).not.toThrow();
  for (const patch of [{ farmMode: 'simulator' }, { liveCommandsEnabled: true }, { livePumpEnabled: true },
    { appEnv: 'staging' }, { controller: 'waiting_for_owner' }, { githubOAuthConfigured: false }, { releaseSha: 'other' }]) {
    expect(() => assertReadOnlyProductionHealth({ ...health, ...patch }, 'tested')).toThrow();
  }
});

it('rewrites only the API proxy for production and rejects competing Git deployment', () => {
  const config = { git: { deploymentEnabled: false }, rewrites: [
    { source: '/api/:path*', destination: 'https://staging.test/api/:path*' },
    { source: '/((?!api/).*)', destination: '/index.html' },
  ] };
  const result = productionHostConfig(config, 'https://smartfarm-api-production.up.railway.app');
  expect(result.rewrites[0].destination).toBe('https://smartfarm-api-production.up.railway.app/api/:path*');
  expect(result.rewrites[1]).toEqual(config.rewrites[1]);
  expect(config.rewrites[0].destination).toContain('staging.test');
  expect(() => productionHostConfig({ ...config, git: { deploymentEnabled: true } }, 'https://smartfarm-api-production.up.railway.app')).toThrow();
});

it('rejects unsafe provider configuration without disclosing variable values', () => {
  const expected = { farmId: 'live-farm', host: 'https://live.test', api: 'https://api.test' };
  const variables = { APP_ENV: 'production', FARM_MODE: 'live', LIVE_COMMANDS_ENABLED: 'false',
    LIVE_PUMP_ENABLED: 'false', FARM_ID: expected.farmId, PUBLIC_APP_ORIGIN: expected.host,
    ALLOWED_BROWSER_ORIGINS: expected.host, PUBLIC_WS_URL: 'wss://api.test/ws',
    HIVEMQ_HOST: 'broker.test', HIVEMQ_USERNAME: 'fixture', HIVEMQ_PASSWORD: 'sensitive-fixture',
    DATABASE_URL: 'sensitive-database', GITHUB_OAUTH_CLIENT_ID: 'fixture', GITHUB_OAUTH_CLIENT_SECRET: 'sensitive-oauth' };
  expect(() => assertProductionVariables(variables, expected)).not.toThrow();
  expect(() => assertProductionVariables({ ...variables, LIVE_COMMANDS_ENABLED: 'true' }, expected)).toThrow('LIVE_COMMANDS_ENABLED');
  try { assertProductionVariables({ ...variables, FARM_ID: 'sensitive-wrong-value' }, expected); }
  catch (error) { expect(error.message).not.toContain('sensitive'); }
});
