import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const targetSha = process.argv[2];
assert.match(targetSha ?? '', /^[a-f0-9]{40}$/, 'Pass the exact expected rollback/restore SHA');
const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: host,
    storageState: JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8')) });
  const health = async () => (await context.request.get(`${api}/health/ready`, { timeout: 5000 })).json();
  const initial = await health();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory',
    liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(initial[key], value);
  assert.notEqual(initial.releaseSha, targetSha);
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.role, 'admin');
  const farm = `/api/v1/farms/${session.farmId}`;
  const snapshot = async () => {
    const response = await context.request.get(`${farm}/snapshot`, { timeout: 5000 });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const allOff = async () => {
    const response = await context.request.post(`${farm}/commands`, { headers: {
      Origin: host, 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': crypto.randomUUID() }, data: { type: 'farm.allOff' } });
    assert.ok(response.ok());
  };
  await allOff();
  const before = await snapshot();
  const epochs = new Set();
  const page = await context.newPage();
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try { const frame = JSON.parse(String(payload)); if (frame.type === 'snapshot') epochs.add(frame.data.connection.controllerEpoch); }
    catch { /* Not a snapshot. */ }
  }));
  await page.goto('/dashboard');
  await expect.poll(() => epochs.size).toBeGreaterThan(0);
  console.log(JSON.stringify({ ready: true, fromSha: initial.releaseSha, targetSha, pausedAndOff: true }));
  const started = Date.now();
  try {
    await expect.poll(async () => {
      try { const h = await health(); return h.releaseSha === targetSha && h.controller === 'owner'; }
      catch { return false; }
    }, { timeout: 180_000, intervals: [1000] }).toBe(true);
    const after = await snapshot();
    assert.notEqual(after.connection.controllerEpoch, before.connection.controllerEpoch);
    assert.deepEqual(after.automations.settings, before.automations.settings);
    assert.equal(after.automations.revision, before.automations.revision);
    assert.equal(after.automations.runtime.masterEnabled, false);
    for (const key of ['fan', 'led', 'pump', 'buzzer', 'feederOpen']) assert.equal(after.readings[key], false);
    await expect.poll(() => epochs.has(after.connection.controllerEpoch), { timeout: 40_000 }).toBe(true);
    const evidence = { observedAt: new Date().toISOString(), fromSha: initial.releaseSha, targetSha,
      oldEpoch: before.connection.controllerEpoch, newEpoch: after.connection.controllerEpoch,
      observationMs: Date.now() - started, settingsAndRevisionRetained: true, automationsPaused: true,
      outputsOff: true, automaticWssRecovery: true, browser: browser.version(),
      limitation: 'Observer readiness to recovery includes operator/provider command time.' };
    await writeFile(new URL(`../../.infra/staging-rollback-${targetSha.slice(0, 7)}.json`, import.meta.url), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { await allOff(); }
} finally { await browser.close(); }
