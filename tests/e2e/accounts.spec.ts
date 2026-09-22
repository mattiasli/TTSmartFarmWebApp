import { expect, test } from '@playwright/test';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';

test('password sign-in and admin account creation show errors and submit the selected role', async ({ page }) => {
  const health = await (await page.request.get('http://127.0.0.1:3001/health/ready')).json();
  expect(health).toMatchObject({ appEnv: 'local', farmMode: 'simulator', databaseConfigured: false });
  let authenticated = false;
  const session = () => ({ authenticated, localLogin: false, passwordLoginEnabled: true, githubLoginEnabled: true,
    githubLoginUrl: 'https://smartfarm-live.vercel.app/api/auth/github/start',
    csrfToken: authenticated ? 'fixture-csrf' : null, farmId: authenticated ? LOCAL_FARM_ID : null,
    username: authenticated ? 'password.admin' : null, role: authenticated ? 'admin' : null });
  await page.route('**/api/v1/session', (route) => route.fulfill({ json: session() }));
  let loginAttempts = 0;
  await page.route('**/api/v1/auth/password/login', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ userId: 'password.admin', password: 'fixture-password-123' });
    if (++loginAttempts === 1) return route.fulfill({ status: 401, json: { error: { message: 'Invalid user ID or password.' } } });
    authenticated = true;
    await route.fulfill({ json: session() });
  });
  await page.route('**/api/v1/farms/*/members', (route) => route.fulfill({ json: { members: [] } }));
  let created = false;
  await page.route('**/api/v1/farms/*/accounts', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe('fixture-csrf');
    expect(route.request().postDataJSON()).toEqual({ userId: 'new.operator', password: 'new-fixture-password', role: 'operator' });
    created = true;
    await route.fulfill({ status: 201, json: { members: [] } });
  });
  await page.goto('/login');
  await expect(page.getByLabel('User ID', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('a').filter({ hasText: 'Sign in with GitHub' })).toHaveAttribute('href', 'https://smartfarm-live.vercel.app/api/auth/github/start');
  await page.getByLabel('User ID', { exact: true }).fill('password.admin');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid user ID or password.');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('User ID', { exact: true }).fill('new.operator');
  await page.getByLabel('Password', { exact: true }).fill('new-fixture-password');
  await page.getByLabel('Role', { exact: true }).selectOption('operator');
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('User created.');
  expect(created).toBe(true);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
});

test('Settings keeps member controls usable at desktop and phone widths and opens diagnostics on demand', async ({ page }) => {
  await page.route('**/api/v1/session', (route) => route.fulfill({ json: { authenticated: true,
    csrfToken: 'fixture-csrf', farmId: LOCAL_FARM_ID, username: 'farm.admin', role: 'admin' } }));
  const username = 'long.user.id.'.padEnd(64, 'x');
  await page.route('**/api/v1/farms/*/members', (route) => route.fulfill({ json: { members: [
    { userId: 'fixture-user', username, role: 'viewer', loginType: 'password', githubId: null },
    { userId: 'fixture-admin', username: 'farm.admin', role: 'admin', loginType: 'github', githubId: '123' },
  ] } }));
  let diagnosticsRequests = 0;
  await page.route('**/api/v1/diagnostics', (route) => {
    diagnosticsRequests++;
    return route.fulfill({ json: { connection: 'fixture' } });
  });
  await page.goto('/settings');
  await expect(page.getByLabel(`Role for ${username}`)).toBeVisible({ timeout: 30000 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Create user' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByLabel(`New password for ${username}`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/settings-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  }
  expect(diagnosticsRequests).toBe(0);
  await page.getByText('Diagnostics', { exact: true }).click();
  await expect.poll(() => diagnosticsRequests).toBe(1);
  await expect(page.locator('.diagnostics')).toContainText('fixture');
});
