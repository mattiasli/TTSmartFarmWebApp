import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
try {
  const context = async (name) => browser.newContext({ baseURL: host,
    storageState: JSON.parse(await readFile(new URL(`../../.infra/${name}`, import.meta.url), 'utf8')) });
  const primary = await context('staging-auth.json');
  const secondary = await context('staging-auth-secondary.json');
  const health = await (await primary.request.get(`${api}/health/ready`)).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory',
    liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(health[key], value);
  const admin = await (await primary.request.get('/api/v1/session')).json();
  const operator = await (await secondary.request.get('/api/v1/session')).json();
  assert.equal(admin.role, 'admin');
  assert.equal(operator.role, 'operator');
  assert.equal(operator.username, 'xueshanmattiasli');
  assert.notEqual(admin.username, operator.username);
  assert.equal(admin.farmId, operator.farmId);
  const farm = `/api/v1/farms/${admin.farmId}`;
  const path = `${farm}/automations/settings`;
  const headers = { Origin: host, 'X-CSRF-Token': admin.csrfToken };
  const snapshot = async () => {
    const result = await primary.request.get(`${farm}/snapshot`);
    assert.equal(result.status(), 200);
    return result.json();
  };
  const allOff = async () => {
    const result = await primary.request.post(`${farm}/commands`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { type: 'farm.allOff' } });
    assert.ok(result.ok());
  };
  const original = (await snapshot()).automations.settings;
  const saveSettings = async (settings) => {
    const current = await snapshot();
    const response = await primary.request.put(path, {
      headers: { ...headers, 'If-Match': String(current.automations.revision) }, data: settings });
    assert.equal(response.status(), 200);
  };
  const save = async (page) => {
    const response = page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    return response;
  };
  const input = (page) => page.getByRole('textbox', { name: 'Fan on at number', exact: true });
  let release = () => {};
  try {
    await allOff();
    await saveSettings({ ...original, fanOn: 29, fanOff: 27 });
    const a = await primary.newPage();
    const b = await secondary.newPage();
    await Promise.all([a.goto('/automations'), b.goto('/automations')]);
    await expect(input(a)).toHaveValue('29');
    await expect(input(b)).toHaveValue('29');
    await input(a).fill('31');
    assert.equal((await save(a)).status(), 200);
    await expect(input(b)).toHaveValue('31');
    await expect(b.getByTestId('settings-conflict')).toHaveCount(0);
    await input(b).fill('33');
    await input(a).fill('32');
    assert.equal((await save(a)).status(), 200);
    await expect(b.getByTestId('settings-conflict')).toBeVisible();
    await expect(input(b)).toHaveValue('33');
    await b.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
    await expect(input(b)).toHaveValue('32');
    await expect(b.getByTestId('settings-conflict')).toHaveCount(0);
    const gate = new Promise((resolve) => { release = resolve; });
    let captured;
    const intercepted = new Promise((resolve) => { captured = resolve; });
    await b.route(`**${path}`, async (route) => { captured(); await gate; await route.continue(); });
    await input(b).fill('34');
    const stale = save(b);
    await intercepted;
    await input(a).fill('35');
    assert.equal((await save(a)).status(), 200);
    release();
    assert.equal((await stale).status(), 409);
    await expect(b.getByTestId('settings-conflict')).toBeVisible();
    await expect(input(b)).toHaveValue('34');
    assert.equal((await snapshot()).automations.settings.fanOn, 35);
    await b.unroute(`**${path}`);
    await b.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
    await input(b).fill('36');
    assert.equal((await save(b)).status(), 200);
    await expect(input(a)).toHaveValue('36');
    const evidence = { observedAt: new Date().toISOString(), apiSha: health.releaseSha,
      browser: browser.version(), identities: [admin.username, operator.username],
      untouchedEditorUpdates: true, dirtyDraftPreserved: true, conflictReload: true,
      overtakenSaveStatus: 409, noOverwrite: true, operatorSaveAllowed: true };
    await writeFile(new URL('../../.infra/staging-concurrency-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    release();
    try { await allOff(); await saveSettings(original); }
    finally {
      const removed = await primary.request.delete(`${farm}/members/268247653`, { headers });
      assert.equal(removed.status(), 200, 'Temporary operator access cleanup failed');
    }
  }
} finally { await browser.close(); }
