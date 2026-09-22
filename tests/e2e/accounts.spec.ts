import { expect, test } from '@playwright/test';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';

test('password sign-in and admin account creation show errors and submit the selected role', async ({ page }) => {
  const health = await (await page.request.get('http://127.0.0.1:3001/health/ready')).json();
  expect(health).toMatchObject({ appEnv: 'local', farmMode: 'simulator', databaseConfigured: false });
  let authenticated = false;
  const session = () => ({ authenticated, localLogin: false, passwordLoginEnabled: true, githubLoginEnabled: true,
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
