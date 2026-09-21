// Shared exact-source verifier checks every required CI job and default-branch history.
import './verify-staging-release-source.mjs';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
const sha = process.env.RELEASE_SHA;
const response = await fetch(`https://api.github.com/repos/mattiasli/TTSmartFarmWebApp/actions/runs?head_sha=${sha}&per_page=100`, {
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200);
const runs = (await response.json()).workflow_runs;
assert.ok(runs.some((run) => run.path === '.github/workflows/smartfarm-web-staging.yml'
  && run.head_sha === sha && run.head_branch === 'master' && run.head_repository?.full_name === 'mattiasli/TTSmartFarmWebApp'
  && run.status === 'completed' && run.conclusion === 'success'), 'Exact revision must pass coordinated staging before production');
