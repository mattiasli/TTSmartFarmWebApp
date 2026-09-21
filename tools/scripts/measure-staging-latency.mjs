import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
const attempt = { startedAt: new Date().toISOString(), phase: 'clock calibration' };
try {
  const context = await browser.newContext({ baseURL: host,
    storageState: JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8')) });
  const calibrations = [];
  let offset;
  let sha;
  const calibrate = async () => {
    const sent = Date.now();
    const response = await context.request.get(`${api}/health/ready`);
    const received = Date.now();
    assert.equal(response.status(), 200);
    const health = await response.json();
    for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory',
      liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(health[key], value);
    if (sha) assert.equal(health.releaseSha, sha, 'Release changed during latency observation');
    sha = health.releaseSha;
    const server = Date.parse(health.serverTime);
    assert.ok(Number.isFinite(server), 'API must expose its own millisecond serverTime for calibration');
    offset = { lower: server - received, upper: server - sent, roundTripMs: received - sent };
    calibrations.push({ observedAt: new Date(received).toISOString(), ...offset });
  };
  await calibrate();
  attempt.apiSha = sha;
  const page = await context.newPage();
  const samples = [];
  let measuring = true;
  const epochs = new Set();
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      if (!measuring) return;
      const frame = JSON.parse(String(payload));
      if (frame.type !== 'snapshot') return;
      const age = frame.data.connection.telemetryAgeMs;
      const sent = Date.parse(frame.sentAt);
      if (typeof age !== 'number' || !Number.isFinite(sent)) return;
      const rawAge = Date.now() - sent + age;
      samples.push({ lowerMs: rawAge + offset.lower, upperMs: rawAge + offset.upper });
      epochs.add(frame.data.connection.controllerEpoch);
    } catch { /* Ignore non-snapshot frames. */ }
  }));
  await page.goto('/dashboard');
  await expect.poll(() => samples.length).toBeGreaterThan(1);
  const startedAt = new Date().toISOString();
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await calibrate();
  }
  measuring = false;
  attempt.sampleCount = samples.length;
  attempt.calibrations = calibrations;
  attempt.phase = 'stale indication and command gating';
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.role, 'admin');
  const farm = `/api/v1/farms/${session.farmId}`;
  const post = async (path, data = {}) => context.request.post(`${farm}/${path}`, {
    headers: { Origin: host, 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': crypto.randomUUID() }, data });
  let staleDetectedMs;
  let staleStartStatus;
  try {
    assert.ok((await post('commands', { type: 'farm.allOff' })).ok());
    assert.ok((await post('automations/start')).ok());
    const started = performance.now();
    assert.ok((await post('simulator/scenario', { scenario: 'telemetry-stall' })).ok());
    await expect(page.getByText('Telemetry is stale. New starts stay disabled.', { exact: true })).toBeVisible({ timeout: 8000 });
    staleDetectedMs = performance.now() - started;
    await expect(page.getByRole('switch', { name: 'Fan', exact: true })).toBeDisabled();
    await expect(page.getByTestId('start-automations')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Water briefly', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop pump', exact: true })).toBeEnabled();
    await expect(page.getByTestId('host-all-off')).toBeEnabled();
    const rejected = await post('commands', { type: 'fan.set', on: true });
    staleStartStatus = rejected.status();
    assert.equal(staleStartStatus, 422);
    assert.equal((await rejected.json()).error.code, 'STALE_TELEMETRY');
    assert.ok((await post('commands', { type: 'pump.stop' })).ok());
    await expect(page.getByText('Telemetry is stale. New starts stay disabled.', { exact: true })).toHaveCount(0, { timeout: 10_000 });
    const recovered = await (await context.request.get(`${farm}/snapshot`)).json();
    assert.equal(recovered.connection.fresh, true);
    assert.equal(recovered.automations.runtime.masterEnabled, false);
  } finally {
    assert.ok((await post('simulator/scenario', { scenario: 'normal' })).ok());
    assert.ok((await post('commands', { type: 'farm.allOff' })).ok());
  }
  const upper = samples.map((sample) => sample.upperMs).sort((a, b) => a - b);
  const evidence = { startedAt, finishedAt: new Date().toISOString(), apiSha: sha, browser: browser.version(),
    source: 'Memory simulator telemetry receipt at API through authenticated WSS to browser observer',
    method: 'Bound API clock offset using client send/receive times around an API-generated millisecond timestamp; recalibrate every 10 seconds. Upper latency bounds include request round-trip uncertainty.',
    assumption: 'Clock offset does not jump between adjacent calibrations. Browser-observer dispatch overhead is included.',
    sampleCount: samples.length, controllerEpochs: [...epochs], calibrations,
    stale: { detectionFromRequestStartMs: staleDetectedMs, staleStartStatus, controlsDisabled: true,
      automaticTelemetryRecovery: true, automationsRemainPaused: true, stopRemainsAvailableAndAccepted: true },
    upperLatencyMs: { p50: upper[Math.ceil(upper.length * 0.5) - 1], p95: upper[Math.ceil(upper.length * 0.95) - 1],
      p99: upper[Math.ceil(upper.length * 0.99) - 1], max: upper.at(-1) },
    underTwoSecondsForAllSamples: upper.every((value) => value < 2000) };
  await writeFile(new URL('../../.infra/staging-latency-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  assert.ok(samples.length >= 100);
  assert.equal(epochs.size, 1);
  assert.equal(evidence.underTwoSecondsForAllSamples, true);
  assert.ok(staleDetectedMs >= 3000 && staleDetectedMs < 6500, 'Stale indication outside expected scheduling window');
} catch (error) {
  await writeFile(new URL('../../.infra/staging-latency-failure.json', import.meta.url), JSON.stringify({
    ...attempt, finishedAt: new Date().toISOString(), passed: false,
    failure: error instanceof Error ? error.message.slice(0, 800) : 'Unknown failure',
  }, null, 2));
  throw error;
} finally { await browser.close(); }
