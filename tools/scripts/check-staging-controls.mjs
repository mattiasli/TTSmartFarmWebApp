import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const state = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
const results = [];
for (const name of ['chromium', 'webkit']) {
  const browser = await ({ chromium, webkit })[name].launch();
  try {
    const context = await browser.newContext({ storageState: state, baseURL: host });
    const health = await (await context.request.get(`${api}/health/ready`)).json();
    for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false, controller: 'owner' })) assert.equal(health[key], value);
    const session = await (await context.request.get('/api/v1/session')).json();
    assert.equal(session.authenticated, true);
    const farm = `/api/v1/farms/${session.farmId}`;
    const snapshot = async () => {
      const response = await context.request.get(`${farm}/snapshot`);
      assert.equal(response.status(), 200);
      return response.json();
    };
    const allOff = async () => {
      const response = await context.request.post(`${farm}/commands`, {
        headers: { Origin: host, 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': crypto.randomUUID() },
        data: { type: 'farm.allOff' },
      });
      assert.ok(response.ok(), 'Simulator cleanup All off failed.');
    };
    try {
      await allOff();
      const page = await context.newPage();
      await page.goto('/dashboard');
      const fan = page.getByRole('switch', { name: 'Fan', exact: true });
      await expect(fan).toBeEnabled({ timeout: 20_000 });
      await expect(fan).not.toBeChecked();
      await fan.click();
      await expect.poll(async () => (await snapshot()).readings.fan).toBe(true);
      await page.getByTestId('host-all-off').click();
      await expect.poll(async () => (await snapshot()).readings.fan).toBe(false);
      await page.route('https://smartfarm-automations*.vercel.app/**', (route) => route.abort());
      await page.goto('/automations');
      await expect(page.getByText('Automation editor unavailable', { exact: true })).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('start-automations').click();
      await expect.poll(async () => (await snapshot()).automations.runtime.masterEnabled).toBe(true);
      await page.getByTestId('pause-automations').click();
      await expect.poll(async () => (await snapshot()).automations.runtime.masterEnabled).toBe(false);
      await page.goto('/dashboard');
      await expect(fan).toBeEnabled();
      await fan.click();
      await expect.poll(async () => (await snapshot()).readings.fan).toBe(true);
      await page.getByTestId('host-all-off').click();
      await expect.poll(async () => (await snapshot()).readings.fan).toBe(false);
      assert.equal((await snapshot()).connection.fresh, true);
      await page.unroute('https://smartfarm-automations*.vercel.app/**');
      await page.goto('/automations');
      await expect(page.getByTestId('automation-editor')).toBeVisible({ timeout: 20_000 });
      results.push({ browser: name, version: browser.version(), apiSha: health.releaseSha,
        fanOnObserved: true, fanOffObserved: true, remoteFailureFallback: true,
        remoteFailureStartPause: true, remoteFailureManualControls: true, freshTelemetry: true, editorRecovery: true });
    } finally { await allOff(); }
  } finally { await browser.close(); }
}
const evidence = { observedAt: new Date().toISOString(), results };
await writeFile(new URL('../../.infra/hosted-controls-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
