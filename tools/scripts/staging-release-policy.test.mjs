import { expect, it } from 'vitest';
import { assertReleaseRun, assertStagingHealth, immutableVercelUrl, stagingRepository } from './staging-release-policy.mjs';

const sha = 'a'.repeat(40);
const run = { head_sha: sha, head_repository: { full_name: stagingRepository }, head_branch: 'master',
  path: '.github/workflows/smartfarm-web-ci.yml', event: 'push', status: 'completed', conclusion: 'success' };
const jobs = ['checks', 'integration', 'federation', 'e2e', 'smartfarm-required'].map((name) => ({ name, conclusion: 'success' }));
it('accepts only the exact trusted CI source and every required job', () => {
  expect(() => assertReleaseRun(run, jobs, sha)).not.toThrow();
  for (const patch of [
    { head_sha: 'b'.repeat(40) }, { head_repository: { full_name: 'fork/repo' } },
    { head_branch: 'feature' }, { event: 'pull_request' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { path: '.github/workflows/other.yml' },
  ]) expect(() => assertReleaseRun({ ...run, ...patch }, jobs, sha)).toThrow();
  expect(() => assertReleaseRun(run, jobs.slice(1), sha)).toThrow();
  expect(() => assertReleaseRun(run, jobs.map((job) => ({ ...job, conclusion: 'skipped' })), sha)).toThrow();
});
it('rejects hardware, enabled live flags, waiting ownership and wrong revision', () => {
  const health = { appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory',
    liveCommandsEnabled: false, livePumpEnabled: false, controller: 'owner', databaseConfigured: true, releaseSha: sha };
  expect(() => assertStagingHealth(health, sha)).not.toThrow();
  for (const patch of [{ appEnv: 'production' }, { farmMode: 'live' }, { livePumpEnabled: true },
    { liveCommandsEnabled: true }, { controller: 'waiting_for_owner' }, { releaseSha: 'dev' }]) {
    expect(() => assertStagingHealth({ ...health, ...patch }, sha)).toThrow();
  }
});
it('accepts only a deployment URL from the intended project', () => {
  const good = 'https://smartfarm-host-abc123-mattias-li-s-projects.vercel.app';
  expect(immutableVercelUrl(good, 'smartfarm-host')).toBe(good);
  for (const bad of ['https://smartfarm-host.vercel.app', good + '?token=x',
    good.replace('smartfarm-host', 'other'), good + '\nhttps://example.com', good + '.evil.test']) {
    expect(() => immutableVercelUrl(bad, 'smartfarm-host')).toThrow();
  }
});
