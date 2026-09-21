import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_AUTOMATIONS, LOCAL_FARM_ID, type FarmSnapshot } from '@smartfarm/contracts';

const farm = `/api/v1/farms/${LOCAL_FARM_ID}`;
const settingsPath = `${farm}/automations/settings`;

async function snapshot(page: Page): Promise<FarmSnapshot> {
  const response = await page.request.get(`${farm}/snapshot`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function resetSimulator(page: Page) {
  const session = await (await page.request.get('/api/v1/session')).json();
  const headers = {
    Origin: 'http://127.0.0.1:5173',
    'X-CSRF-Token': session.csrfToken,
    'Idempotency-Key': crypto.randomUUID(),
  };
  const stopped = await page.request.post(`${farm}/commands`, {
    headers, data: { type: 'farm.allOff' },
  });
  expect(stopped.ok()).toBe(true);
  const current = await snapshot(page);
  const saved = await page.request.put(settingsPath, {
    headers: { ...headers, 'If-Match': String(current.automations.revision) },
    data: DEFAULT_AUTOMATIONS,
  });
  expect(saved.ok()).toBe(true);
}

async function openEditor(page: Page) {
  await page.goto('/automations');
  await expect(page.getByRole('textbox', { name: 'Fan on at number', exact: true })).toHaveValue('29');
}

async function save(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith(settingsPath) && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  return response;
}

test.beforeEach(async ({ page, request }) => {
  // Check the actual server before any mutation, even when run without the harness.
  const health = await (await request.get('http://127.0.0.1:3001/health/ready')).json();
  expect(health).toMatchObject({
    appEnv: 'local', farmMode: 'simulator', simulatorTransport: 'memory',
    liveCommandsEnabled: false, livePumpEnabled: false, databaseConfigured: false,
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('host-all-off')).toBeEnabled();
  await resetSimulator(page);
});

test.afterEach(async ({ page }) => {
  await resetSimulator(page);
});

test('remote load failure leaves sensors, Pause, and All off functional', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Automation editor unavailable', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('24°C', { exact: true })).toBeVisible();
  await page.getByTestId('start-automations').click();
  await expect.poll(async () => (await snapshot(page)).automations.runtime.masterEnabled).toBe(true);
  await page.getByTestId('pause-automations').click();
  await expect.poll(async () => (await snapshot(page)).automations.runtime.masterEnabled).toBe(false);
  await page.getByRole('switch', { name: 'Fan', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).readings?.fan).toBe(true);
  await page.getByTestId('host-all-off').click();
  await expect.poll(async () => (await snapshot(page)).readings?.fan).toBe(false);
  await expect(page.getByRole('switch', { name: 'Fan', exact: true })).not.toBeChecked();
  await page.unroute('http://127.0.0.1:5174/**');
  await page.getByRole('button', { name: 'Retry editor', exact: true }).click();
  await expect(page.getByTestId('automation-editor')).toBeVisible({ timeout: 15_000 });
  expect((await snapshot(page)).automations.runtime.masterEnabled).toBe(false);
});

test('an untouched editor follows settings saved in another browser session', async ({ page, browser }) => {
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const other = await second.newPage();
    await openEditor(page);
    await openEditor(other);
    await page.getByRole('textbox', { name: 'Fan on at number', exact: true }).fill('31');
    expect((await save(page)).status()).toBe(200);
    await expect(other.getByRole('textbox', { name: 'Fan on at number', exact: true })).toHaveValue('31');
    await expect(other.getByTestId('settings-conflict')).toHaveCount(0);
    await expect(other.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  } finally {
    await second.close();
  }
});

test('concurrent settings save preserves a dirty draft and reload resolves the conflict', async ({ page, browser }) => {
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const other = await second.newPage();
    await openEditor(page);
    await openEditor(other);
    const draft = other.getByRole('textbox', { name: 'Fan on at number', exact: true });
    await draft.fill('33');
    await page.getByRole('textbox', { name: 'Fan on at number', exact: true }).fill('31');
    expect((await save(page)).status()).toBe(200);
    await expect(other.getByTestId('settings-conflict')).toBeVisible();
    await expect(draft).toHaveValue('33');
    expect((await snapshot(other)).automations.settings.fanOn).toBe(31);
    await other.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
    await expect(draft).toHaveValue('31');
    await expect(other.getByTestId('settings-conflict')).toHaveCount(0);
    await expect(other.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  } finally {
    await second.close();
  }
});

test('a save overtaken in transit receives 409 and retains the unsaved values', async ({ page, browser }) => {
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    const other = await second.newPage();
    await openEditor(page);
    await openEditor(other);
    let captured!: () => void;
    const intercepted = new Promise<void>((resolve) => { captured = resolve; });
    await other.route(`**${settingsPath}`, async (route) => {
      captured();
      await gate;
      await route.continue(); // Actual API performs the revision check.
    });
    await other.getByRole('textbox', { name: 'Fan on at number', exact: true }).fill('33');
    const staleResponse = save(other);
    await intercepted;
    await page.getByRole('textbox', { name: 'Fan on at number', exact: true }).fill('31');
    expect((await save(page)).status()).toBe(200);
    release();
    expect((await staleResponse).status()).toBe(409);
    await expect(other.getByTestId('settings-conflict')).toBeVisible();
    await expect(other.getByRole('textbox', { name: 'Fan on at number', exact: true })).toHaveValue('33');
    expect((await snapshot(other)).automations.settings.fanOn).toBe(31);
  } finally {
    release();
    await second.close();
  }
});

test('an incomplete number remains an edit when another session saves', async ({ page, browser }) => {
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const other = await second.newPage();
    await openEditor(page);
    await openEditor(other);
    const input = other.getByRole('textbox', { name: 'Fan on at number', exact: true });
    await input.fill('');
    await page.getByRole('textbox', { name: 'Fan on at number', exact: true }).fill('31');
    expect((await save(page)).status()).toBe(200);
    await expect(other.getByTestId('settings-conflict')).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(other.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await other.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(input).toHaveValue('31');
    await expect(other.getByTestId('settings-conflict')).toHaveCount(0);
  } finally {
    await second.close();
  }
});
