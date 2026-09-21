import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
try {
  const state = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
  const context = await browser.newContext({ storageState: state, baseURL: host });
  const health = await (await context.request.get(`${api}/health/ready`)).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false, controller: 'owner' })) assert.equal(health[key], value);
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.authenticated, true);
  const farm = `/api/v1/farms/${session.farmId}`;
  const headers = { Origin: host, 'X-CSRF-Token': session.csrfToken };
  const post = async (url, data) => {
    const response = await context.request.post(url, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data });
    assert.ok(response.ok(), `Request failed with ${response.status()}`);
    return response.json();
  };
  const snapshot = async () => {
    const response = await context.request.get(`${farm}/snapshot`, { timeout: 5_000 });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const page = await context.newPage();
  const epochs = new Set();
  page.on('websocket', (socket) => socket.on('framereceived', ({payload}) => {
    try { const frame = JSON.parse(String(payload)); if (frame.type === 'snapshot') epochs.add(frame.data.connection.controllerEpoch); } catch { /* not a snapshot */ }
  }));
  await page.goto('/dashboard');
  await expect.poll(() => epochs.size).toBeGreaterThan(0);
  const before = await snapshot();
  try {
    await post(`${farm}/automations/start`, {});
    await post(`${farm}/commands`, { type: 'fan.set', on: true });
    await expect.poll(async () => (await snapshot()).readings.fan).toBe(true);
    assert.equal((await snapshot()).automations.runtime.masterEnabled, true);
    console.log('Restart observer ready: simulator automations running, fan on, browser receiving WSS.');
    const started = Date.now();
    let after;
    await expect.poll(async () => {
      try { after = await snapshot(); return after.connection.controllerEpoch !== before.connection.controllerEpoch && after.connection.ownership === 'owner'; }
      catch { return false; }
    }, { timeout: 120_000, intervals: [500, 1_000] }).toBe(true);
    const recoveryMs = Date.now() - started;
    assert.deepEqual(after.automations.settings, before.automations.settings);
    assert.equal(after.automations.revision, before.automations.revision);
    assert.equal(after.automations.runtime.masterEnabled, false);
    assert.equal(after.readings.fan, false);
    assert.equal(after.readings.pump, false);
    let wssRecovered = true;
    try { await expect.poll(() => epochs.has(after.connection.controllerEpoch), { timeout: 40_000 }).toBe(true); }
    catch { wssRecovered = false; }
    const evidence = { observedAt: new Date().toISOString(), apiSha: health.releaseSha, browser: browser.version(),
      oldEpoch: before.connection.controllerEpoch, newEpoch: after.connection.controllerEpoch,
      automationsRunningBefore: true, fanRunningBefore: true, settingsRetained: true,
      automationsPausedAfter: true, fanOffAfter: true, pumpOffAfter: true,
      recoveryMs, automaticWssRecovery: wssRecovered };
    await writeFile(new URL('../../.infra/staging-restart-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    if (!wssRecovered) process.exitCode = 1;
  } finally { await post(`${farm}/commands`, { type: 'farm.allOff' }); }
} finally { await browser.close(); }
