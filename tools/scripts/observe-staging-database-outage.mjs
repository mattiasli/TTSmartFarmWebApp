import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
try {
  const state = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
  const context = await browser.newContext({ storageState: state, baseURL: host });
  const health = async () => {
    const response = await context.request.get(`${api}/health/ready`, { timeout: 3000 });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const initialHealth = await health();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator',
    simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false,
    controller: 'owner' })) assert.equal(initialHealth[key], value);
  assert.equal(initialHealth.releaseSha, process.argv[2], 'Pass the deployed source SHA');
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.role, 'admin');
  const farm = `/api/v1/farms/${session.farmId}`;
  const post = (path, data) => context.request.post(`${farm}/${path}`, {
    headers: { Origin: host, 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': crypto.randomUUID() },
    data, timeout: 8000,
  });
  const snapshot = async () => {
    const response = await context.request.get(`${farm}/snapshot`, { timeout: 3000 });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const page = await context.newPage();
  let latestFrame;
  let frameCount = 0;
  let waitingFrames = 0;
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      const frame = JSON.parse(String(payload));
      if (frame.type !== 'snapshot') return;
      latestFrame = frame.data;
      frameCount++;
      if (frame.data.connection.ownership === 'waiting_for_owner') waitingFrames++;
    } catch { /* Ignore non-JSON frames. */ }
  }));
  await page.goto('/dashboard');
  await expect.poll(() => frameCount).toBeGreaterThan(1);
  assert.ok((await post('commands', { type: 'farm.allOff' })).ok());
  const before = await snapshot();
  try {
    assert.ok((await post('automations/start', {})).ok());
    assert.equal((await snapshot()).automations.runtime.masterEnabled, true);
    console.log('Database outage observer ready: staging memory simulator, automations started, browser WSS active. Restart the staging Postgres service now.');
    const started = Date.now();
    let lossAt;
    let readinessSamples = 0;
    await expect.poll(async () => {
      const result = await health();
      readinessSamples++;
      if (result.controller !== 'waiting_for_owner') return false;
      lossAt = Date.now();
      return true;
    }, { timeout: 180000, intervals: [200] }).toBe(true);
    const mutation = await post('commands', { type: 'fan.set', on: true });
    assert.ok(mutation.status() >= 400, `Mutation unexpectedly accepted: ${mutation.status()}`);
    let after;
    await expect.poll(async () => {
      try { after = await snapshot(); return after.connection.ownership === 'owner'; }
      catch { return false; }
    }, { timeout: 120000, intervals: [500] }).toBe(true);
    assert.equal(after.connection.controllerEpoch, before.connection.controllerEpoch, 'API process unexpectedly restarted');
    assert.deepEqual(after.automations.settings, before.automations.settings);
    assert.equal(after.automations.revision, before.automations.revision);
    assert.equal(after.automations.runtime.masterEnabled, false);
    assert.equal(after.readings.pump, false);
    assert.equal(after.readings.fan, false);
    const recoveredFrames = frameCount;
    await expect.poll(() => frameCount, { timeout: 40000 }).toBeGreaterThan(recoveredFrames);
    assert.equal(latestFrame.connection.ownership, 'owner');
    assert.equal(latestFrame.automations.runtime.masterEnabled, false);
    const evidence = { observedAt: new Date().toISOString(), apiSha: initialHealth.releaseSha,
      browser: browser.version(), readinessSamples, waitingFrames,
      mutationStatus: mutation.status(), apiProcessSurvived: true,
      settingsRetained: true, automationsPausedAfter: true, pumpOffAfter: true, fanOffAfter: true,
      automaticWssRecovery: true, timeToLossMs: lossAt - started, recoveryMs: Date.now() - lossAt,
      publishEvidence: 'Hosted rejected mutation and off outputs; actual no-publish assertion is in the real PostgreSQL TCP-outage integration test.',
      backupRestore: 'Explicitly deferred; no backup or restore performed.' };
    await writeFile(new URL('../../.infra/staging-database-outage.json', import.meta.url), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    assert.ok((await post('commands', { type: 'farm.allOff' })).ok(), 'Simulator cleanup failed');
  }
} finally { await browser.close(); }
