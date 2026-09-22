import assert from 'node:assert/strict';

const readOnlyFlags = Object.freeze({ liveCommandsEnabled: false, livePumpEnabled: false });

export function productionControlFlags(variables, mode = 'read-only') {
  assert.ok(['read-only', 'preserve-control-flags'].includes(mode), 'Unknown production release mode');
  for (const key of ['LIVE_COMMANDS_ENABLED', 'LIVE_PUMP_ENABLED']) {
    assert.ok(['true', 'false'].includes(variables[key]), `Invalid production flag: ${key}`);
  }
  const flags = Object.freeze({ liveCommandsEnabled: variables.LIVE_COMMANDS_ENABLED === 'true',
    livePumpEnabled: variables.LIVE_PUMP_ENABLED === 'true' });
  if (mode === 'read-only') assert.deepEqual(flags, readOnlyFlags, 'Read-only release requires both flags disabled');
  return flags;
}

export function assertProductionHealth(health, sha, flags = readOnlyFlags) {
  for (const [key, value] of Object.entries({ appEnv: 'production', farmMode: 'live',
    liveCommandsEnabled: flags.liveCommandsEnabled, livePumpEnabled: flags.livePumpEnabled, controller: 'owner',
    databaseConfigured: true, githubOAuthConfigured: true })) assert.equal(health[key], value, key);
  if (sha) assert.equal(health.releaseSha, sha);
}

export function assertReadOnlyProductionHealth(health, sha) {
  assertProductionHealth(health, sha, readOnlyFlags);
}

export function productionHostConfig(config, api) {
  assert.equal(config.git?.deploymentEnabled, false);
  assert.match(api, /^https:\/\/smartfarm-api-production\.up\.railway\.app$/);
  assert.equal(config.rewrites.filter(({source}) => source === '/api/:path*').length, 1);
  return { ...config, rewrites: config.rewrites.map((rule) => rule.source === '/api/:path*'
    ? { ...rule, destination: `${api}/api/:path*` } : rule) };
}

export function assertProductionVariables(variables, expected, flags = readOnlyFlags) {
  for (const [name, value] of Object.entries({ APP_ENV: 'production', FARM_MODE: 'live',
    LIVE_COMMANDS_ENABLED: String(flags.liveCommandsEnabled), LIVE_PUMP_ENABLED: String(flags.livePumpEnabled), FARM_ID: expected.farmId,
    PUBLIC_APP_ORIGIN: expected.host, ALLOWED_BROWSER_ORIGINS: expected.host,
    PUBLIC_WS_URL: expected.api.replace('https:', 'wss:') + '/ws' })) {
    // Do not include provider values in assertion diagnostics.
    assert.ok(variables[name] === value, `Production setting does not match: ${name}`);
  }
  for (const name of ['HIVEMQ_HOST', 'HIVEMQ_USERNAME', 'HIVEMQ_PASSWORD', 'DATABASE_URL',
    'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET']) assert.ok(variables[name], `Missing production variable: ${name}`);
}
