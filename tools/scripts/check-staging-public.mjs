import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Read-only public smoke. No stored browser profile, session, or provider token.
const release = JSON.parse(await readFile(process.env.STAGING_RELEASE_MANIFEST ?? new URL('../../docs/releases/staging.json', import.meta.url), 'utf8'));
const hostOrigin = release.host.publicOrigin;
const apiOrigin = release.api.publicOrigin;
const remoteEntry = release.remote.immutableEntryUrl ?? `${release.remote.publicOrigin}/remoteEntry.js`;
const remoteOrigin = new URL(remoteEntry).origin;
const results = [];
async function check(name, run) {
  try {
    results.push({ name, status: 'pass', evidence: await run() });
  } catch (error) {
    results.push({ name, status: 'fail', reason: error instanceof Error ? error.message : String(error) });
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  context.setDefaultTimeout(20_000);
  await check('staging mode and controller ownership', async () => {
    const response = await context.request.get(`${apiOrigin}/health/ready`);
    assert.equal(response.status(), 200);
    const body = await response.json();
    for (const [key, value] of Object.entries({
      status: 'ready', appEnv: 'staging', farmMode: 'simulator',
      simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false,
      databaseConfigured: true, githubOAuthConfigured: true,
    })) assert.equal(body[key], value, `Unexpected health field ${key}`);
    assert.equal(body.controller, 'owner', `Controller is ${body.controller}; HTTP readiness alone does not qualify staging.`);
    assert.match(body.releaseSha ?? '', /^[a-f0-9]{40}$/i, 'API release SHA is missing or invalid.');
    if (process.env.EXPECTED_API_SHA) assert.equal(body.releaseSha, process.env.EXPECTED_API_SHA);
    return { controller: body.controller, mode: body.farmMode, liveFlags: false, releaseSha: body.releaseSha };
  });
  await check('anonymous session through host proxy', async () => {
    const response = await context.request.get(`${hostOrigin}/api/v1/session`);
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.localLogin, false);
    assert.match(response.headers()['cache-control'] ?? '', /no-store/);
    return { anonymous: true, localLogin: false, noStore: true };
  });
  await check('clean-browser cross-origin remote and child chunks', async () => {
    const page = await context.newPage();
    const assets = [];
    const failed = [];
    page.on('response', (response) => {
      if (new URL(response.url()).origin !== remoteOrigin) return;
      assets.push(response);
    });
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).origin === remoteOrigin) failed.push(new URL(request.url()).pathname);
    });
    const host = await page.goto(`${hostOrigin}/login`);
    assert.equal(host?.status(), 200);
    // Exercise the actual deployed federation container and its imported assets
    // from the host origin. This does not stand in for authenticated UI rendering.
    const meta = await page.evaluate(async (entry) => {
      const remote = await import(entry);
      await remote.init({});
      const factory = await remote.get('./AutomationPanel');
      const module = factory();
      return { ...module.automationPanelContract, componentType: typeof module.default };
    }, remoteEntry);
    assert.equal(meta.contractVersion, 1);
    assert.equal(meta.componentType, 'function');
    assert.match(meta.releaseSha ?? '', /^[a-f0-9]{40}$/i, 'Remote release SHA is missing or invalid.');
    if (process.env.EXPECTED_REMOTE_SHA) assert.equal(meta.releaseSha, process.env.EXPECTED_REMOTE_SHA);
    assert.deepEqual(failed, []);
    assert.ok(assets.length > 1, 'Expected the entry and imported child assets.');
    for (const asset of assets) {
      assert.equal(asset.status(), 200, `Asset failed: ${new URL(asset.url()).pathname}`);
      assert.match(asset.headers()['content-type'] ?? '', /javascript|text\/css/);
      assert.ok(['*', hostOrigin].includes(asset.headers()['access-control-allow-origin']), 'Remote asset CORS is missing.');
    }
    await page.close();
    return { assets: assets.length, contractMajor: meta.contractVersion, releaseSha: meta.releaseSha, immutablePin: Boolean(release.remote.immutableEntryUrl) };
  });
  await check('missing remote module returns 404', async () => {
    const missing = await context.request.get(`${remoteOrigin}/assets/smartfarm-missing-${crypto.randomUUID()}.js`);
    assert.equal(missing.status(), 404);
    return { status: 404 };
  });
} finally {
  await browser.close();
}
console.log(JSON.stringify({ observedAt: new Date().toISOString(), results }, null, 2));
if (results.some((result) => result.status === 'fail')) process.exitCode = 1;
