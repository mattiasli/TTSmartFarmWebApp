import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = 'https://smartfarm-host.vercel.app';
const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/login`);
  console.log('Complete SmartFarm GitHub sign-in in the opened browser. No credentials are printed.');
  const deadline = Date.now() + 15 * 60_000;
  let saved = false;
  while (Date.now() < deadline && browser.isConnected()) {
    const response = await context.request.get(`${origin}/api/v1/session`);
    const session = response.ok() ? await response.json() : null;
    if (session?.authenticated) {
      const state = await context.storageState();
      const cookies = state.cookies.filter((cookie) => cookie.name === 'smartfarm_session' && cookie.domain === new URL(origin).hostname);
      if (cookies.length !== 1) throw new Error('Expected one host-scoped SmartFarm session cookie.');
      await mkdir(new URL('../../.infra/', import.meta.url), { recursive: true });
      await writeFile(new URL('../../.infra/staging-auth.json', import.meta.url), JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
      console.log(JSON.stringify({ authenticated: true, role: session.role, saved: '.infra/staging-auth.json', githubCookiesSaved: false }));
      saved = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!saved) throw new Error('Sign-in was not completed; no session saved.');
} finally {
  await browser.close();
}
