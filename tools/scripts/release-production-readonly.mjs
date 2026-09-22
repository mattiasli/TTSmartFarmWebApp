import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { activeDeploymentId, immutableVercelUrl } from './staging-release-policy.mjs';
import { assertProductionVariables, assertProductionHealth, productionControlFlags, productionHostConfig } from './production-release-policy.mjs';
import { checkRemoteRelease } from './check-staging-release-candidate.mjs';
import { checkProductionLogin } from './check-production-login.mjs';

const target = JSON.parse(await readFile('tools/deploy/production.json', 'utf8'));
const { project, environment, service, team, hostProject, remoteProject, host, api } = target;
const sha = process.env.RELEASE_SHA;
const releaseMode = process.env.PRODUCTION_RELEASE_MODE ?? 'read-only';
assert.ok(['read-only', 'preserve-control-flags'].includes(releaseMode), 'Unknown production release mode');
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
assert.equal(process.env.PRODUCTION_READONLY_RELEASE_ENABLED, 'true');
for (const name of ['RAILWAY_TOKEN', 'VERCEL_HOST_TOKEN', 'VERCEL_REMOTE_TOKEN', 'VERCEL_HOST_AUTOMATION_BYPASS']) {
  assert.ok(process.env[name], `Missing production deployment secret: ${name}`);
}
const evidence = { schemaVersion: 1, environment: 'production', scope: releaseMode, sourceSha: sha,
  ciRunUrl: process.env.RELEASE_CI_URL, startedAt: new Date().toISOString(), stages: [],
  commandPublishCalls: 0, backupRestoreDisposition: 'Explicitly deferred by user.',
  freshOAuthVerified: false, authenticatedTelemetryVerified: false, hardwareAcceptancePassed: false };
await mkdir('test-results', { recursive: true });
const save = () => writeFile('test-results/production-release.json', JSON.stringify(evidence, null, 2));
async function stage(name, action) {
  const entry = { name, startedAt: new Date().toISOString(), status: 'running' };
  evidence.stages.push(entry);
  await save();
  console.log(`Production release (${releaseMode}): ${name}`);
  try { await action(); entry.status = 'passed'; }
  catch { entry.status = 'failed'; throw new Error(`Production release failed at ${name}; inspect provider state before retrying.`); }
  finally { entry.finishedAt = new Date().toISOString(); await save(); }
}
function cli(command, args, token, vercelProject) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, token ? [...args, '--token', token] : args, {
      env: { ...process.env, ...(vercelProject ? { VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: vercelProject } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60_000,
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', () => {}); // Never emit provider bodies or credential-bearing CLI arguments.
    child.on('error', () => reject(new Error(`${command} could not run`)));
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed`)));
  });
}
async function railway(query) {
  const response = JSON.parse(await cli('railway', ['api', query, '--compact']));
  assert.ok(!response.errors, 'Railway request rejected');
  return response.data;
}
async function vercel(endpoint, token, method = 'GET', body) {
  const response = await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${team}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  assert.ok(response.ok, `Vercel request failed (${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function health() {
  const response = await fetch(`${api}/health/ready`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return response.json();
}
const settingsQuery = `query { serviceInstance(serviceId: "${service}", environmentId: "${environment}") {
  numReplicas sleepApplication drainingSeconds healthcheckPath preDeployCommand
  activeDeployments { id status } latestDeployment { id status } } }`;
const deployment = (url, token) => vercel(`/v13/deployments/${new URL(url).hostname}`, token);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let controlFlags;
async function verifyProviderFlags() {
  const variables = JSON.parse(await cli('railway', ['variables', '--project', project,
    '--environment', environment, '--service', service, '--json']));
  assertProductionVariables(variables, target, controlFlags);
}

await stage('control configuration and deployment authority', async () => {
  assert.equal((await cli('git', ['rev-parse', 'HEAD'])).trim(), sha);
  assert.equal((await cli('git', ['status', '--porcelain', '--untracked-files=no'])).trim(), '');
  const variables = JSON.parse(await cli('railway', ['variables', '--project', project,
    '--environment', environment, '--service', service, '--json']));
  controlFlags = productionControlFlags(variables, releaseMode);
  evidence.controlFlags = controlFlags;
  assertProductionVariables(variables, target, controlFlags);
  const triggers = await railway(`query { deploymentTriggers(projectId: "${project}", environmentId: "${environment}", serviceId: "${service}", first: 10) { edges { node { id } } } }`);
  assert.equal(triggers.deploymentTriggers.edges.length, 0);
  const settings = (await railway(settingsQuery)).serviceInstance;
  assert.equal(settings.numReplicas, 1);
  assert.equal(settings.sleepApplication, false);
  assert.equal(settings.drainingSeconds, 15);
  assert.equal(settings.healthcheckPath, '/health/ready');
  assert.ok(settings.preDeployCommand.includes('npm run db:migrate'));
  if (settings.activeDeployments.length) {
    const current = await health();
    assertProductionHealth(current, undefined, controlFlags);
    evidence.previousApi = { sourceSha: current.releaseSha, deploymentId: activeDeploymentId(settings) };
  } else {
    assert.ok(!settings.latestDeployment || ['FAILED', 'REMOVED'].includes(settings.latestDeployment.status));
    evidence.previousApi = null;
  }
  for (const [id, token] of [[hostProject, process.env.VERCEL_HOST_TOKEN], [remoteProject, process.env.VERCEL_REMOTE_TOKEN]]) {
    const info = await vercel(`/v9/projects/${id}`, token);
    assert.ok(!info.link, 'Production projects must not have a competing Git integration');
  }
  const remote = await vercel(`/v9/projects/${remoteProject}`, process.env.VERCEL_REMOTE_TOKEN);
  assert.ok(!remote.ssoProtection, 'Immutable remote assets must be public before deployment');
});

await stage('API migration and ownership with preserved control flags', async () => {
  await verifyProviderFlags();
  const original = await readFile('Dockerfile', 'utf8');
  const block = /ARG RAILWAY_GIT_COMMIT_SHA=dev\r?\nENV RELEASE_SHA=\$\{RAILWAY_GIT_COMMIT_SHA\}\r?\nLABEL org\.opencontainers\.image\.revision=\$\{RAILWAY_GIT_COMMIT_SHA\}/;
  assert.match(original, block);
  try {
    await writeFile('Dockerfile', original.replace(block, `ENV RELEASE_SHA=${sha}\nLABEL org.opencontainers.image.revision=${sha}`));
    await cli('railway', ['up', '--project', project, '--environment', environment, '--service', service,
      '--detach', '--json', '--message', `production-${releaseMode} ${sha}`]);
  } finally { await writeFile('Dockerfile', original); }
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const settings = (await railway(settingsQuery)).serviceInstance;
    assert.ok(!['FAILED', 'CRASHED', 'REMOVED'].includes(settings.latestDeployment?.status), 'API deployment failed');
    try {
      assertProductionHealth(await health(), sha, controlFlags);
      const deploymentId = activeDeploymentId(settings);
      assert.equal(deploymentId, settings.latestDeployment.id);
      evidence.api = { sourceSha: sha, deploymentId, publicOrigin: api };
      return;
    } catch { await wait(5000); }
  }
  throw new Error('API readiness deadline exceeded');
});

const metadata = ['--meta', `githubCommitSha=${sha}`, '--meta', 'githubCommitRef=master',
  '--meta', 'githubCommitOrg=mattiasli', '--meta', 'githubCommitRepo=TTSmartFarmWebApp'];
const deployArgs = ['deploy', '.', '--prod', '--skip-domain', '--yes', '--build-env', `VITE_RELEASE_SHA=${sha}`, ...metadata];
let remoteEntry;
await stage('public immutable remote', async () => {
  const url = immutableVercelUrl(await cli('vercel', deployArgs, process.env.VERCEL_REMOTE_TOKEN, remoteProject), target.remoteName);
  const info = await deployment(url, process.env.VERCEL_REMOTE_TOKEN);
  assert.equal(info.readyState, 'READY');
  remoteEntry = `${url}/remoteEntry.js`;
  evidence.remote = { sourceSha: sha, deploymentId: info.id, immutableEntryUrl: remoteEntry };
  evidence.remoteSmoke = await checkRemoteRelease({ remote: remoteEntry, sha });
});
let candidate;
await stage('host with production proxy and pinned remote', async () => {
  const original = await readFile('apps/dashboard/vercel.json', 'utf8');
  try {
    await writeFile('apps/dashboard/vercel.json', JSON.stringify(productionHostConfig(JSON.parse(original), api), null, 2));
    candidate = immutableVercelUrl(await cli('vercel', [...deployArgs, '--build-env', `VITE_AUTOMATIONS_REMOTE_URL=${remoteEntry}`,
      '--meta', `smartfarmRemoteEntry=${remoteEntry}`], process.env.VERCEL_HOST_TOKEN, hostProject), target.hostName);
  } finally { await writeFile('apps/dashboard/vercel.json', original); }
  const info = await deployment(candidate, process.env.VERCEL_HOST_TOKEN);
  assert.equal(info.readyState, 'READY');
  evidence.host = { sourceSha: sha, deploymentId: info.id, deploymentUrl: candidate, publicOrigin: host };
  evidence.candidateSmoke = await checkProductionLogin({ host, candidate, bypass: process.env.VERCEL_HOST_AUTOMATION_BYPASS });
});
await stage('promotion and public login verification', async () => {
  await verifyProviderFlags();
  assertProductionHealth(await health(), sha, controlFlags);
  await vercel(`/v10/projects/${hostProject}/promote/${evidence.host.deploymentId}`, process.env.VERCEL_HOST_TOKEN, 'POST', {});
  let promoted = false;
  for (let attempt = 0; attempt < 36; attempt++) {
    try { promoted = (await deployment(host, process.env.VERCEL_HOST_TOKEN)).id === evidence.host.deploymentId; } catch { /* Alias convergence. */ }
    if (promoted) break;
    await wait(5000);
  }
  assert.ok(promoted);
  evidence.stableSmoke = await checkProductionLogin({ host, candidate: host });
  await verifyProviderFlags();
  assertProductionHealth(await health(), sha, controlFlags);
});
evidence.finishedAt = new Date().toISOString();
evidence.qualification = 'Hosting deployed with verified control flags. OAuth, authenticated telemetry and physical acceptance are recorded separately; this workflow performs no actuator tests.';
await save();
