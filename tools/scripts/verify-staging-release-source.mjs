import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { assertReleaseRun, stagingRepository } from './staging-release-policy.mjs';

assert.equal(process.env.GITHUB_REPOSITORY, stagingRepository);
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const sha = process.env.GITHUB_EVENT_NAME === 'workflow_run' ? event.workflow_run?.head_sha : process.env.RELEASE_SHA;
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
const get = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${stagingRepository}${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `GitHub verification failed: ${response.status}`);
  return response.json();
};
const comparison = await get(`/compare/${sha}...master`);
assert.ok(['ahead', 'identical'].includes(comparison.status), 'Revision is not on default-branch history');
const runs = await get(`/actions/runs?head_sha=${sha}&per_page=100`);
const eligible = runs.workflow_runs.filter((run) => run.path === '.github/workflows/smartfarm-web-ci.yml'
  && run.status === 'completed' && run.conclusion === 'success' && run.head_branch === 'master'
  && ['push', 'workflow_dispatch'].includes(run.event));
assert.ok(eligible.length, 'No successful CI run for this default-branch revision');
const selected = eligible[0];
const jobs = await get(`/actions/runs/${selected.id}/jobs?per_page=100`);
assertReleaseRun(selected, jobs.jobs, sha);
await appendFile(process.env.GITHUB_OUTPUT, `sha=${sha}\nci_url=${selected.html_url}\n`);
console.log(`Verified ${sha} against ${selected.html_url}`);
