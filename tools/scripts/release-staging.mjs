import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from '@playwright/test';
import { assertStagingHealth, immutableVercelUrl } from './staging-release-policy.mjs';
import { checkReleaseCandidate, checkRemoteRelease } from './check-staging-release-candidate.mjs';

const project = '285fc6b3-caef-4e86-9a03-0966a2262b2b';
const environment = '9229a204-ddea-466e-a906-438c5ed1e757';
const service = 'acac3d1f-1dc4-4f32-ba83-81a704167f31';
const team = 'team_G6TWPLIoH81XbfAJksQWzF6g';
const scope = 'mattias-li-s-projects';
const hostProject = 'prj_7vukfeWHuhz7dxS42OiBNHodnWK3';
const remoteProject = 'prj_0bBsZ7ZVP2Sna1tFk0EyWYNLdn4G';
const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const sha = process.env.RELEASE_SHA;
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
assert.equal(process.env.STAGING_RELEASE_ENABLED, 'true');
for (const name of ['RAILWAY_TOKEN', 'VERCEL_HOST_TOKEN', 'VERCEL_REMOTE_TOKEN', 'STAGING_SESSION_COOKIE', 'VERCEL_HOST_AUTOMATION_BYPASS']) {
  assert.ok(process.env[name], `Missing GitHub staging environment secret: ${name}`);
}
const evidence = { schemaVersion: 1, environment: 'staging', sourceSha: sha,
  ciRunUrl: process.env.RELEASE_CI_URL, startedAt: new Date().toISOString(), stages: [],
  backupRestoreDisposition: 'Explicitly deferred by user; not performed by this workflow.' };
await mkdir('test-results', { recursive: true });
const save = () => writeFile('test-results/staging-release.json', JSON.stringify(evidence, null, 2));
const stage = async (name, action) => {
  const entry = { name, startedAt: new Date().toISOString(), status: 'running' };
  evidence.stages.push(entry);
  await save();
  console.log(`Staging release: ${name}`);
  try { const result = await action(); entry.status = 'passed'; return result; }
  catch (error) {
    entry.status = 'failed';
    if (error.releaseDiagnostic) entry.diagnostic = error.releaseDiagnostic;
    throw new Error(`Staging release failed at ${name}; inspect provider state before retrying.`);
  }
  finally { entry.finishedAt = new Date().toISOString(); await save(); }
};
function cli(command, args, token) {
  return new Promise((resolve, reject) => {
    // Never echo command arguments or child errors: a Vercel token is an argument.
    const child = spawn(command, token ? [...args, '--token', token] : args,
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += String(data); });
    child.stderr.on('data', (data) => { stderr = (stderr + String(data)).slice(-16000); });
    child.on('error', () => reject(new Error(`${command} could not run`)));
    child.on('close', (code) => {
      if (code === 0) { resolve(stdout); return; }
      const error = new Error(`${command} exited unsuccessfully`);
      // eslint-disable-next-line no-control-regex -- Strip CLI ANSI color escapes before selecting error lines.
      let diagnostic = stderr.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)
        .filter((line) => /^(?:Error:|error:)/.test(line.trim())).join('\n');
      for (const name of ['RAILWAY_TOKEN', 'VERCEL_HOST_TOKEN', 'VERCEL_REMOTE_TOKEN', 'STAGING_SESSION_COOKIE', 'VERCEL_HOST_AUTOMATION_BYPASS']) {
        if (process.env[name]) diagnostic = diagnostic.replaceAll(process.env[name], '[redacted]');
      }
      // URLs may carry credentials or provider request parameters.
      error.releaseDiagnostic = `${command} exit ${code}: ${diagnostic.replace(/https?:\/\/\S+/g, '[provider URL]').slice(0, 1500)}`;
      console.log(error.releaseDiagnostic);
      reject(error);
    });
  });
}
async function railway(query) {
  const result = JSON.parse(await cli('railway', ['api', query, '--compact']));
  assert.equal(result.errors, undefined, 'Railway query failed');
  return result.data;
}
async function vercel(path, token) {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${team}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `Vercel read failed: ${response.status}`);
  return response.json();
}
const deployment = (url, token) => vercel(`/v13/deployments/${new URL(url).hostname}`, token);
const serviceQuery = `query { serviceInstance(environmentId: "${environment}", serviceId: "${service}") {
  numReplicas sleepApplication drainingSeconds healthcheckPath healthcheckTimeout preDeployCommand
  activeDeployments { id status } latestDeployment { id status }
} }`;
const context = await request.newContext({ baseURL: host });
const health = async () => {
  const response = await context.get(`${api}/health/ready`, { timeout: 5000 });
  assert.equal(response.status(), 200);
  return response.json();
};
let authenticated;
try {
  await stage('preflight and previous release', async () => {
    assert.equal((await cli('git', ['rev-parse', 'HEAD'])).trim(), sha, 'Checkout differs from verified source');
    assert.equal((await cli('git', ['status', '--porcelain', '--untracked-files=no'])).trim(), '', 'Tracked source must be clean');
    assertStagingHealth(await health());
    for (const app of ['dashboard', 'automations-remote']) {
      const config = JSON.parse(await readFile(`apps/${app}/vercel.json`, 'utf8'));
      assert.equal(config.git?.deploymentEnabled, false, 'Disable competing Vercel Git deployments before activation');
    }
    const triggers = await railway(`query { deploymentTriggers(projectId: "${project}", environmentId: "${environment}",
      serviceId: "${service}", first: 10) { edges { node { id } } } }`);
    assert.equal(triggers.deploymentTriggers.edges.length, 0, 'Disconnect competing Railway Git deployment source before activation');
    const settings = (await railway(serviceQuery)).serviceInstance;
    assert.equal(settings.numReplicas, 1);
    assert.equal(settings.sleepApplication, false);
    assert.equal(settings.drainingSeconds, 15);
    assert.equal(settings.healthcheckPath, '/health/ready');
    assert.ok(settings.preDeployCommand.includes('npm run db:migrate'));
    assert.ok(settings.activeDeployments.every((item) => item.status === 'SUCCESS'), 'Another Railway deployment is active');
    const previous = JSON.parse(await readFile('docs/releases/staging.json', 'utf8'));
    const currentHost = await deployment(host, process.env.VERCEL_HOST_TOKEN);
    const remoteEntry = currentHost.meta?.smartfarmRemoteEntry ?? previous.remote.immutableEntryUrl;
    const currentRemote = await deployment(remoteEntry, process.env.VERCEL_REMOTE_TOKEN);
    evidence.previousCompatibleRelease = {
      api: { sourceSha: (await health()).releaseSha, deploymentId: settings.latestDeployment.id },
      host: { deploymentId: currentHost.id, url: `https://${currentHost.url}`, sourceSha: currentHost.meta?.githubCommitSha },
      remote: { deploymentId: currentRemote.id, immutableEntryUrl: remoteEntry },
    };
    authenticated = await request.newContext({ baseURL: host, storageState: { origins: [], cookies: [{
      name: 'smartfarm_session', value: process.env.STAGING_SESSION_COOKIE, domain: new URL(host).hostname,
      path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'Lax',
    }] } });
    const session = await (await authenticated.get('/api/v1/session')).json();
    assert.equal(session.role, 'admin');
    const farm = `/api/v1/farms/${session.farmId}`;
    const snapshot = await (await authenticated.get(`${farm}/snapshot`)).json();
    assert.equal(snapshot.readings.pump, false);
    const pause = await authenticated.post(`${farm}/automations/pause`, {
      headers: { Origin: host, 'X-CSRF-Token': session.csrfToken }, data: {},
    });
    assert.equal(pause.status(), 200);
  });

  await stage('API deployment and paused ownership', async () => {
    // CLI uploads have no Git-trigger SHA. Bake the verified checkout revision
    // into the uploaded image, independently of provider runtime variables.
    const dockerfile = await readFile('Dockerfile', 'utf8');
    const revisionBlock = /ARG RAILWAY_GIT_COMMIT_SHA=dev\r?\nENV RELEASE_SHA=\$\{RAILWAY_GIT_COMMIT_SHA\}\r?\nLABEL org\.opencontainers\.image\.revision=\$\{RAILWAY_GIT_COMMIT_SHA\}/;
    assert.match(dockerfile, revisionBlock, 'Dockerfile revision template changed');
    try {
      await writeFile('Dockerfile', dockerfile.replace(revisionBlock,
        `ENV RELEASE_SHA=${sha}\nLABEL org.opencontainers.image.revision=${sha}`));
      await cli('railway', ['up', '--project', project, '--service', service, '--environment', environment,
        '--detach', '--json', '--message', `staging ${sha}`]);
    } finally { await writeFile('Dockerfile', dockerfile); }
    const deadline = Date.now() + 15 * 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      const current = (await railway(serviceQuery)).serviceInstance.latestDeployment;
      if (['FAILED', 'CRASHED', 'REMOVED'].includes(current.status)) throw new Error('API deployment failed');
      try { assertStagingHealth(await health(), sha); ready = current.status === 'SUCCESS'; }
      catch { ready = false; }
      if (ready) { evidence.api = { sourceSha: sha, deploymentId: current.id, publicOrigin: api }; break; }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    assert.ok(ready, 'API did not become owner on the requested revision');
    const session = await (await authenticated.get('/api/v1/session')).json();
    const snapshot = await (await authenticated.get(`/api/v1/farms/${session.farmId}/snapshot`)).json();
    assert.equal(snapshot.automations.runtime.masterEnabled, false);
    assert.equal(snapshot.readings.pump, false);
  });

  const metadata = ['--meta', `githubCommitSha=${sha}`, '--meta', 'githubCommitRef=master',
    '--meta', 'githubCommitOrg=mattiasli', '--meta', 'githubCommitRepo=TTSmartFarmWebApp'];
  const deployArgs = ['deploy', '.', '--prod', '--skip-domain', '--yes', '--scope', scope,
    '--build-env', `VITE_RELEASE_SHA=${sha}`, ...metadata];
  let remoteEntry;
  await stage('immutable remote deployment', async () => {
    const url = immutableVercelUrl(await cli('vercel', [...deployArgs, '--project', remoteProject],
      process.env.VERCEL_REMOTE_TOKEN), 'smartfarm-automations');
    const info = await deployment(url, process.env.VERCEL_REMOTE_TOKEN);
    assert.equal(info.readyState, 'READY');
    remoteEntry = `${url}/remoteEntry.js`;
    evidence.remote = { deploymentId: info.id, sourceSha: sha, immutableEntryUrl: remoteEntry, contractMajor: 1 };
    evidence.remoteSmoke = await checkRemoteRelease({ remote: remoteEntry, sha });
  });
  let candidate;
  await stage('host built against the immutable remote', async () => {
    candidate = immutableVercelUrl(await cli('vercel', [...deployArgs, '--project', hostProject,
      '--build-env', `VITE_AUTOMATIONS_REMOTE_URL=${remoteEntry}`, '--meta', `smartfarmRemoteEntry=${remoteEntry}`],
    process.env.VERCEL_HOST_TOKEN), 'smartfarm-host');
    const info = await deployment(candidate, process.env.VERCEL_HOST_TOKEN);
    assert.equal(info.readyState, 'READY');
    evidence.host = { deploymentId: info.id, sourceSha: sha, deploymentUrl: candidate, publicOrigin: host };
  });
  await stage('candidate browser qualification', async () => {
    evidence.candidateSmoke = await checkReleaseCandidate({ candidate, remote: remoteEntry, sha,
      cookie: process.env.STAGING_SESSION_COOKIE, protectionBypass: process.env.VERCEL_HOST_AUTOMATION_BYPASS });
  });
  await stage('host promotion and stable-origin qualification', async () => {
    await cli('vercel', ['promote', candidate, '--yes', '--scope', scope], process.env.VERCEL_HOST_TOKEN);
    const promoted = await deployment(host, process.env.VERCEL_HOST_TOKEN);
    assert.equal(promoted.id, evidence.host.deploymentId);
    evidence.stableSmoke = await checkReleaseCandidate({ candidate: host, remote: remoteEntry, sha,
      cookie: process.env.STAGING_SESSION_COOKIE });
    assertStagingHealth(await health(), sha);
    const session = await (await authenticated.get('/api/v1/session')).json();
    const metrics = await authenticated.get(`/api/v1/farms/${session.farmId}/diagnostics/database`);
    assert.equal(metrics.status(), 200);
    evidence.database = { migrations: (await metrics.json()).migrations };
  });
  evidence.qualification = 'ordered staging release passed; fresh OAuth and hardware gates remain separate';
  evidence.finishedAt = new Date().toISOString();
  await save();
} finally {
  await authenticated?.dispose();
  await context.dispose();
}
