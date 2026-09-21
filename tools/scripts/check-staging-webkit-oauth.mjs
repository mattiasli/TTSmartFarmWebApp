import assert from 'node:assert/strict';
import { webkit, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const browser = await webkit.launch({ headless: false });
try {
  const context = await browser.newContext({ baseURL: host });
  const page = await context.newPage();
  let callbackCookie = null;
  let githubAuthorizationSeen = false;
  let frames = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'github.com' && url.pathname === '/login/oauth/authorize') githubAuthorizationSeen = true;
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== host || url.pathname !== '/api/auth/github/callback') return;
    const headers = await response.headersArray();
    const cookie = headers.find((header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('smartfarm_session='));
    if (cookie) callbackCookie = { secure: /;\s*secure(?:;|$)/i.test(cookie.value),
      httpOnly: /;\s*httponly(?:;|$)/i.test(cookie.value), sameSiteLax: /;\s*samesite=lax(?:;|$)/i.test(cookie.value),
      hostOnly: !/;\s*domain=/i.test(cookie.value) };
  });
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try { if (JSON.parse(String(payload)).type === 'snapshot') frames++; } catch { /* Not a snapshot. */ }
  }));
  await page.goto('/login');
  console.log('Complete GitHub sign-in as mattiasli in the WebKit window. No credentials or OAuth URLs are recorded.');
  const deadline = Date.now() + 15 * 60_000;
  let session;
  while (Date.now() < deadline) {
    const response = await context.request.get('/api/v1/session');
    if (response.ok()) {
      session = await response.json();
      if (session.authenticated) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(session?.authenticated, true, 'WebKit sign-in was not completed');
  assert.equal(session.username, 'mattiasli');
  assert.equal(githubAuthorizationSeen, true);
  assert.deepEqual(callbackCookie, { secure: true, httpOnly: true, sameSiteLax: true, hostOnly: true });
  await page.goto('/automations');
  await expect(page.getByTestId('automation-editor')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => frames).toBeGreaterThan(1);
  const snapshot = await context.request.get(`/api/v1/farms/${session.farmId}/snapshot`);
  assert.equal(snapshot.status(), 200);
  assert.match(snapshot.headers()['cache-control'], /no-store/);
  const health = await (await context.request.get('https://default-service-production.up.railway.app/health/ready')).json();
  const evidence = { observedAt: new Date().toISOString(), apiSha: health.releaseSha,
    browser: 'webkit', version: browser.version(), actualGithubOAuth: true, callbackCookie,
    editorRendered: true, wssSnapshots: frames, authenticatedSnapshot: true, noStore: true,
    importedCookies: false, githubCookiesSaved: false };
  await writeFile(new URL('../../.infra/staging-webkit-oauth-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
