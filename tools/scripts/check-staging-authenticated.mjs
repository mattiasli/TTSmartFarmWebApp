import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const release = JSON.parse(await readFile(new URL('../../docs/releases/staging.json', import.meta.url), 'utf8'));
const origin = release.host.publicOrigin;
assert.equal(origin, 'https://smartfarm-host.vercel.app');
assert.ok(release.remote.immutableEntryUrl, 'An immutable remote pin is required.');
const remote = new URL(release.remote.immutableEntryUrl).origin;
const state = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
const results = [];
for (const name of process.argv.includes('--webkit') ? ['chromium', 'webkit'] : ['chromium']) {
  const browser = await ({ chromium, webkit })[name].launch();
  try {
    const context = await browser.newContext({ storageState: state, baseURL: origin });
    const cookie = (await context.cookies(origin)).find((c) => c.name === 'smartfarm_session');
    assert.ok(cookie?.secure && cookie.httpOnly);
    // Windows WebKit reports None even for an imported synthetic Lax cookie.
    // Test authenticated rendering separately; do not claim WebKit OAuth/Lax qualification.
    if (name === 'chromium') assert.equal(cookie.sameSite, 'Lax');
    const response = await context.request.get('/api/v1/session');
    assert.equal(response.status(), 200);
    assert.match(response.headers()['cache-control'], /no-store/);
    const session = await response.json();
    assert.equal(session.authenticated, true);
    const snap = await context.request.get(`/api/v1/farms/${session.farmId}/snapshot`);
    assert.equal(snap.status(), 200);
    const snapshot = await snap.json();
    assert.equal(snapshot.simulation, true);
    assert.equal(snapshot.connection.ownership, 'owner');
    assert.match(snap.headers()['cache-control'], /no-store/);
    const page = await context.newPage();
    let frames = 0;
    let wss = false;
    const remoteAssets = [];
    const pageErrors = [];
    page.on('pageerror', () => pageErrors.push('pageerror'));
    page.on('websocket', (socket) => {
      wss ||= socket.url().startsWith('wss://default-service-production.up.railway.app/');
      socket.on('framereceived', ({ payload }) => {
        try { if (JSON.parse(String(payload)).type === 'snapshot') frames += 1; } catch { /* not a snapshot */ }
      });
    });
    page.on('response', (r) => {
      if (new URL(r.url()).hostname.startsWith('smartfarm-automations')) remoteAssets.push({ origin: new URL(r.url()).origin, status: r.status() });
    });
    await page.goto('/automations');
    await expect(page.getByTestId('automation-editor')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => frames, { timeout: 20_000 }).toBeGreaterThan(1);
    assert.equal(wss, true);
    assert.ok(remoteAssets.length > 1);
    assert.ok(remoteAssets.every((a) => a.origin === remote && a.status === 200), 'Host did not load the pinned remote and its assets.');
    assert.deepEqual(pageErrors, []);
    results.push({ browser: name, version: browser.version(), authenticated: true, role: session.role,
      secureHttpOnlyCookie: true, sameSiteReported: cookie.sameSite, sameSiteQualified: name === 'chromium', noStore: true, snapshot: true, editorRendered: true,
      wssSnapshots: frames, remoteAssets: remoteAssets.length, pinnedRemote: remote, pageErrors: 0,
      oauthFlow: 'reused app session; this script does not test OAuth redirects' });
  } finally { await browser.close(); }
}
const evidence = { observedAt: new Date().toISOString(), results };
await writeFile(new URL('../../.infra/authenticated-staging-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
