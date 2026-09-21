import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const host = 'https://smartfarm-host.vercel.app';

export async function checkRemoteRelease({ remote, sha }) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = new URL(remote).origin;
    const assets = [];
    page.on('response', (response) => {
      if (new URL(response.url()).origin === origin) assets.push(response);
    });
    await page.goto(`${host}/login`);
    const contract = await page.evaluate(async (entry) => {
      const container = await import(entry);
      await container.init({});
      const module = (await container.get('./AutomationPanel'))();
      return { ...module.automationPanelContract, componentType: typeof module.default };
    }, remote);
    assert.equal(contract.contractVersion, 1);
    assert.equal(contract.releaseSha, sha);
    assert.equal(contract.componentType, 'function');
    assert.ok(assets.length > 1);
    for (const asset of assets) {
      assert.equal(asset.status(), 200);
      assert.match(asset.headers()['content-type'] ?? '', /javascript|text\/css/);
      assert.ok(['*', host].includes(asset.headers()['access-control-allow-origin']));
    }
    const missing = await context.request.get(`${origin}/assets/missing-${crypto.randomUUID()}.js`);
    assert.equal(missing.status(), 404);
    return { sourceSha: sha, contractMajor: 1, publicAssets: assets.length, missingChunkStatus: 404 };
  } finally { await browser.close(); }
}

/** Exercise candidate assets/proxy at their eventual host origin before promotion. */
export async function checkReleaseCandidate({ candidate, remote, sha, cookie, protectionBypass }) {
  assert.ok(cookie, 'A current staging app session is required for authenticated smoke');
  const browser = await chromium.launch();
  try {
    const routeCandidate = async (context) => {
      if (candidate === host) return;
      assert.ok(protectionBypass, 'Candidate protection-bypass secret is required');
      await context.route(`${host}/**`, async (route) => {
        const original = new URL(route.request().url());
        const response = await route.fetch({ url: `${candidate}${original.pathname}${original.search}`,
          headers: { ...route.request().headers(), 'x-vercel-protection-bypass': protectionBypass },
          maxRedirects: 0 });
        await route.fulfill({ response });
      });
    };
    const remoteOrigin = new URL(remote).origin;

    const context = await browser.newContext();
    await context.addCookies([{ name: 'smartfarm_session', value: cookie,
      domain: new URL(host).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
    await routeCandidate(context);
    const page = await context.newPage();
    let frames = 0;
    let errors = 0;
    const loadedRemoteOrigins = new Set();
    page.on('pageerror', () => { errors++; });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.hostname.startsWith('smartfarm-automations')) loadedRemoteOrigins.add(url.origin);
    });
    page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
      try { if (JSON.parse(String(payload)).type === 'snapshot') frames++; } catch { /* Non-JSON frame. */ }
    }));
    await page.goto(`${host}/automations`);
    await expect(page.getByTestId('automation-editor')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => frames, { timeout: 20000 }).toBeGreaterThan(1);
    const state = await page.evaluate(async () => {
      const sessionResponse = await fetch('/api/v1/session');
      const session = await sessionResponse.json();
      if (!session.authenticated) return { authenticated: false };
      const snapshotResponse = await fetch(`/api/v1/farms/${session.farmId}/snapshot`);
      const snapshot = await snapshotResponse.json();
      const eventsResponse = await fetch(`/api/v1/farms/${session.farmId}/events?limit=1`);
      return { authenticated: true, role: session.role, simulation: snapshot.simulation,
        owner: snapshot.connection.ownership, paused: !snapshot.automations.runtime.masterEnabled,
        pumpOff: snapshot.readings?.pump === false, eventsStatus: eventsResponse.status,
        noStore: [sessionResponse, snapshotResponse, eventsResponse].every((response) =>
          response.headers.get('cache-control')?.includes('no-store')) };
    });
    assert.deepEqual(state, { authenticated: true, role: 'admin', simulation: true,
      owner: 'owner', paused: true, pumpOff: true, eventsStatus: 200, noStore: true });
    assert.equal(errors, 0);
    assert.deepEqual([...loadedRemoteOrigins], [remoteOrigin]);
    return { browser: browser.version(), candidate, remote, sourceSha: sha,
      actualCandidateAssetsAndProxy: true,
      authenticatedEditor: true, wssFrames: frames, historyRead: true, paused: true,
      oauth: 'Existing staging app session; fresh OAuth is qualified separately.' };
  } finally { await browser.close(); }
}
