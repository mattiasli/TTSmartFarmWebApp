import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const githubId = '268247653';
const browser = await chromium.launch();
try {
  const context = async (file) => browser.newContext({ baseURL: host,
    storageState: JSON.parse(await readFile(new URL(`../../.infra/${file}`, import.meta.url), 'utf8')) });
  const admin = await context('staging-auth.json');
  const viewer = await context('staging-auth-secondary.json');
  const health = await (await admin.request.get(`${api}/health/ready`)).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator',
    simulatorTransport: 'memory', liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(health[key], value);
  const owner = await (await admin.request.get('/api/v1/session')).json();
  const secondary = await (await viewer.request.get('/api/v1/session')).json();
  assert.equal(owner.role, 'admin');
  assert.equal(secondary.authenticated, true);
  assert.equal(secondary.username, 'xueshanmattiasli');
  assert.equal(secondary.role, 'viewer');
  assert.equal(owner.farmId, secondary.farmId);
  const farm = `/api/v1/farms/${owner.farmId}`;
  const headers = { Origin: host, 'X-CSRF-Token': secondary.csrfToken, 'Idempotency-Key': crypto.randomUUID() };
  assert.equal((await viewer.request.get(`${farm}/snapshot`)).status(), 200);
  assert.equal((await viewer.request.get(`${farm}/members`)).status(), 403);
  assert.equal((await viewer.request.post(`${farm}/commands`, { headers, data: { type: 'fan.set', on: true } })).status(), 403);
  assert.equal((await viewer.request.put(`${farm}/members/${githubId}`, { headers, data: { role: 'admin' } })).status(), 403);
  const page = await viewer.newPage();
  await page.goto('/dashboard');
  await expect(page.getByRole('switch', { name: 'Fan', exact: true })).toBeDisabled();
  await page.evaluate(async ({ csrfToken, farmId }) => {
    const response = await fetch('/api/v1/realtime/tickets', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ farmId }) });
    if (!response.ok) throw new Error('Could not create test socket ticket');
    const ticket = await response.json();
    const socket = new WebSocket(ticket.wsUrl);
    window.revocationProbe = { snapshots: 0, closed: false, code: null };
    socket.onopen = () => socket.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket }));
    socket.onmessage = (event) => { if (JSON.parse(event.data).type === 'snapshot') window.revocationProbe.snapshots++; };
    socket.onclose = (event) => { window.revocationProbe.closed = true; window.revocationProbe.code = event.code; };
  }, { csrfToken: secondary.csrfToken, farmId: secondary.farmId });
  await expect.poll(() => page.evaluate(() => window.revocationProbe.snapshots)).toBeGreaterThan(1);
  const started = Date.now();
  const revoked = await admin.request.delete(`${farm}/members/${githubId}`, {
    headers: { Origin: host, 'X-CSRF-Token': owner.csrfToken } });
  assert.equal(revoked.status(), 200);
  await expect.poll(() => page.evaluate(() => window.revocationProbe.closed), { timeout: 5_000 }).toBe(true);
  const closeMs = Date.now() - started;
  assert.equal(await page.evaluate(() => window.revocationProbe.code), 4002);
  assert.equal((await viewer.request.get(`${farm}/snapshot`)).status(), 401);
  assert.equal((await viewer.request.post(`${farm}/commands`, { headers, data: { type: 'farm.allOff' } })).status(), 401);
  assert.equal((await viewer.request.post('/api/v1/realtime/tickets', { headers, data: { farmId: owner.farmId } })).status(), 401);
  await page.reload();
  assert.equal((await viewer.request.get(`${farm}/snapshot`)).status(), 401);
  assert.equal((await admin.request.get(`${farm}/snapshot`)).status(), 200);
  const members = (await (await admin.request.get(`${farm}/members`)).json()).members;
  assert.ok(!members.some((member) => member.githubId === githubId && member.allowlisted));
  const evidence = { observedAt: new Date().toISOString(), apiSha: health.releaseSha,
    browser: browser.version(), username: secondary.username, viewerRead: true,
    viewerControlsDisabled: true, viewerWriteDenied: true, viewerAdminDenied: true,
    socketClosedCode: 4002, closeMs, revokedReadWriteAndTicketsDenied: true,
    refreshStillDenied: true, primaryAdminRetained: true, temporaryAccessRemoved: true };
  await writeFile(new URL('../../.infra/staging-revocation-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
