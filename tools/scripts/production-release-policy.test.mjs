import { expect, it } from 'vitest';
import { assertProductionVariables, assertProductionHealth, assertReadOnlyProductionHealth, productionControlFlags, productionHostConfig } from './production-release-policy.mjs';

it.each([[false, false], [true, false], [true, true], [false, true]])(
  'preserves exact control flags %s/%s and rejects runtime drift', (commands, pump) => {
    const variables = { LIVE_COMMANDS_ENABLED: String(commands), LIVE_PUMP_ENABLED: String(pump) };
    const flags = productionControlFlags(variables, 'preserve-control-flags');
    expect(flags).toEqual({ liveCommandsEnabled: commands, livePumpEnabled: pump });
    const health = { appEnv: 'production', farmMode: 'live', controller: 'owner',
      databaseConfigured: true, githubOAuthConfigured: true, releaseSha: 'release', ...flags };
    expect(() => assertProductionHealth(health, 'release', flags)).not.toThrow();
    for (const patch of [{ liveCommandsEnabled: !commands }, { livePumpEnabled: !pump },
      { farmMode: 'simulator' }, { controller: 'waiting_for_owner' }, { releaseSha: 'other' }]) {
      expect(() => assertProductionHealth({ ...health, ...patch }, 'release', flags)).toThrow();
    }
    expect(variables).toEqual({ LIVE_COMMANDS_ENABLED: String(commands), LIVE_PUMP_ENABLED: String(pump) });
    expect(Object.isFrozen(flags)).toBe(true);
  },
);

it('requires an explicit preserving mode and rejects missing or malformed flags', () => {
  const enabled = { LIVE_COMMANDS_ENABLED: 'true', LIVE_PUMP_ENABLED: 'true' };
  expect(() => productionControlFlags(enabled)).toThrow();
  expect(() => productionControlFlags(enabled, 'enable-pump')).toThrow();
  for (const patch of [{ LIVE_PUMP_ENABLED: undefined }, { LIVE_PUMP_ENABLED: 'yes' }, { LIVE_COMMANDS_ENABLED: '' }]) {
    expect(() => productionControlFlags({ ...enabled, ...patch }, 'preserve-control-flags')).toThrow();
  }
});

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
  const custom = { ...expected, browserOrigins: [expected.host, 'https://ttsmartfarm.mattias.li'] };
  expect(() => assertProductionVariables({ ...variables, ALLOWED_BROWSER_ORIGINS: custom.browserOrigins.join(',') }, custom)).not.toThrow();
  expect(() => assertProductionVariables(variables, custom)).toThrow('ALLOWED_BROWSER_ORIGINS');
  expect(() => assertProductionVariables({ ...variables, ALLOWED_BROWSER_ORIGINS: '*' }, custom)).toThrow('ALLOWED_BROWSER_ORIGINS');
  const enabled = { ...variables, LIVE_COMMANDS_ENABLED: 'true', LIVE_PUMP_ENABLED: 'true' };
  const flags = productionControlFlags(enabled, 'preserve-control-flags');
  expect(() => assertProductionVariables(enabled, expected, flags)).not.toThrow();
  expect(() => assertProductionVariables({ ...enabled, LIVE_PUMP_ENABLED: 'false' }, expected, flags)).toThrow('LIVE_PUMP_ENABLED');
  expect(() => assertProductionVariables({ ...variables, LIVE_COMMANDS_ENABLED: 'true' }, expected)).toThrow('LIVE_COMMANDS_ENABLED');
  try { assertProductionVariables({ ...variables, FARM_ID: 'sensitive-wrong-value' }, expected); }
  catch (error) { expect(error.message).not.toContain('sensitive'); }
});
