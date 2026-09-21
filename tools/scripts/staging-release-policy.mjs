import assert from 'node:assert/strict';

export const stagingRepository = 'mattiasli/TTSmartFarmWebApp';
export function activeDeploymentId(settings) {
  assert.equal(settings.activeDeployments?.length, 1, 'Expected exactly one stable active API deployment');
  const active = settings.activeDeployments[0];
  assert.equal(active.status, 'SUCCESS', 'Active API deployment is not stable');
  assert.ok(active.id);
  return active.id;
}
export function assertReleaseRun(run, jobs, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.equal(run.head_sha, sha);
  assert.equal(run.head_repository?.full_name, stagingRepository);
  assert.equal(run.head_branch, 'master');
  assert.equal(run.path, '.github/workflows/smartfarm-web-ci.yml');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event));
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  for (const name of ['checks', 'integration', 'federation', 'e2e', 'smartfarm-required']) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or ambiguous CI job: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `CI job did not pass: ${name}`);
  }
}

export function assertStagingHealth(health, sha) {
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator',
    simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false,
    controller: 'owner', databaseConfigured: true })) assert.equal(health[key], value, key);
  if (sha) assert.equal(health.releaseSha, sha);
}

export function immutableVercelUrl(output, project) {
  const matches = output.trim().split(/\r?\n/).filter((line) => /^https:\/\//.test(line.trim()));
  assert.equal(matches.length, 1, 'Expected one Vercel deployment URL');
  const url = new URL(matches[0].trim());
  assert.equal(url.protocol, 'https:');
  assert.match(url.hostname, new RegExp(`^${project}-[a-z0-9]+-mattias-li-s-projects\\.vercel\\.app$`));
  assert.equal(url.pathname, '/');
  assert.equal(url.search + url.hash + url.username + url.password, '');
  return url.origin;
}
