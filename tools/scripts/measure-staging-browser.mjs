import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const durationMs = 30 * 60_000;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
};
const summarize = (values) => ({ count: values.length, min: Math.min(...values),
  p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), max: Math.max(...values) });
const browser = await chromium.launch();
try {
  const storageState = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
  const context = await browser.newContext({ baseURL: host, storageState });
  const health = await (await context.request.get(`${api}/health/ready`)).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator',
    simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(health[key], value);
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.authenticated, true);
  const page = await context.newPage();
  const ages = [];
  const delivery = [];
  const intervals = [];
  const heaps = [];
  const epochs = new Set();
  let previous = null;
  let sockets = 0;
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });
  page.on('websocket', (socket) => {
    sockets++;
    socket.on('framereceived', ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.type !== 'snapshot') return;
        const now = Date.now();
        if (previous !== null) intervals.push(now - previous);
        previous = now;
        const transit = now - Date.parse(frame.sentAt);
        if (Number.isFinite(transit)) delivery.push(transit);
        const age = frame.data.connection.telemetryAgeMs;
        if (typeof age === 'number' && Number.isFinite(transit)) ages.push(age + transit);
        epochs.add(frame.data.connection.controllerEpoch);
      } catch { /* Only validated snapshot fields are measured. */ }
    });
  });
  await page.goto('/dashboard');
  await expect.poll(() => ages.length).toBeGreaterThan(1);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const startedAt = new Date().toISOString();
  const start = Date.now();
  console.log(JSON.stringify({ startedAt, durationMs, apiSha: health.releaseSha, observing: true }));
  while (Date.now() - start < durationMs) {
    const result = await cdp.send('Performance.getMetrics');
    const values = Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
    heaps.push({ elapsedMs: Date.now() - start, usedBytes: values.JSHeapUsedSize, totalBytes: values.JSHeapTotalSize });
    await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, Math.max(1, durationMs - (Date.now() - start)))));
    console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - start) / 1000), snapshots: ages.length, controllerEpochs: epochs.size }));
  }
  const finalHealth = await (await context.request.get(`${api}/health/ready`)).json();
  const evidence = { startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - start,
    apiSha: health.releaseSha, finalApiSha: finalHealth.releaseSha, browser: browser.version(),
    clockQualification: 'Browser/server clock offset is not independently measured. Age and delivery values assume synchronized clocks; they do not alone prove the latency target.',
    approximateTelemetryToBrowserMs: summarize(ages), approximateServerToBrowserMs: summarize(delivery),
    snapshotIntervalMs: summarize(intervals), browserJsHeap: heaps, controllerEpochs: [...epochs], sockets, pageErrors,
    memoryScope: 'Chromium page JavaScript heap only; provider process memory and database size/retention require separate evidence.' };
  await writeFile(new URL('../../.infra/staging-browser-measurement.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ finished: true, snapshots: ages.length, pageErrors, controllerEpochs: epochs.size }));
  assert.equal(pageErrors, 0);
  assert.ok(ages.length > 1000, 'Insufficient snapshots for the observation window.');
  assert.equal(health.releaseSha, finalHealth.releaseSha, 'Release changed during observation.');
} finally { await browser.close(); }
