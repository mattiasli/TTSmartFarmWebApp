import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Initial deployment has no app session yet. This checks only login/proxy delivery;
// authenticated telemetry and physical acceptance remain separate requirements.
export async function checkProductionLogin({ host, candidate, bypass }) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    if (candidate !== host) {
      assert.ok(bypass);
      await context.route(`${host}/**`, async (route) => {
        const original = new URL(route.request().url());
        const response = await route.fetch({ url: `${candidate}${original.pathname}${original.search}`,
          headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass }, maxRedirects: 0 });
        await route.fulfill({ response });
      });
    }
    const page = await context.newPage();
    let errors = 0;
    page.on('pageerror', () => { errors++; });
    await page.goto(`${host}/login`);
    await expect(page.locator('a[href="/api/auth/github/start"]')).toBeVisible();
    const session = await page.evaluate(async () => {
      const response = await fetch('/api/v1/session');
      const body = await response.json();
      return { status: response.status, authenticated: body.authenticated,
        githubLoginEnabled: body.githubLoginEnabled, localLogin: body.localLogin,
        noStore: response.headers.get('cache-control')?.includes('no-store') };
    });
    assert.deepEqual(session, { status: 200, authenticated: false,
      githubLoginEnabled: true, localLogin: false, noStore: true });
    assert.equal(errors, 0);
    return { browser: browser.version(), actualHostProxy: true, loginRendered: true,
      freshOAuthVerified: false, authenticatedTelemetryVerified: false };
  } finally { await browser.close(); }
}
