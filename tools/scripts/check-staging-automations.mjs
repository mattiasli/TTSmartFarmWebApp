import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const host = 'https://smartfarm-host.vercel.app';
const api = 'https://default-service-production.up.railway.app';
const browser = await chromium.launch();
try {
  const storageState = JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8'));
  const context = await browser.newContext({ baseURL: host, storageState });
  const health = await (await context.request.get(`${api}/health/ready`)).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', simulatorTransport: 'memory',
    liveCommandsEnabled: false, livePumpEnabled: false, controller: 'owner' })) assert.equal(health[key], value);
  const session = await (await context.request.get('/api/v1/session')).json();
  assert.equal(session.role, 'admin');
  const farm = `/api/v1/farms/${session.farmId}`;
  const headers = { Origin: host, 'X-CSRF-Token': session.csrfToken };
  const durations = [];
  const snapshot = async () => {
    const response = await context.request.get(`${farm}/snapshot`);
    assert.equal(response.status(), 200);
    return response.json();
  };
  const post = async (path, data = {}) => {
    const start = performance.now();
    const response = await context.request.post(`${farm}/${path}`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data });
    const elapsed = performance.now() - start;
    if (!response.ok()) {
      const body = await response.json();
      throw new Error(`${path} ${data.type ?? ''} failed: ${response.status()} ${body.error?.code ?? 'UNKNOWN'}`);
    }
    if (path === 'commands') durations.push(elapsed);
    return response.json();
  };
  const command = (data) => post('commands', data);
  const scenario = (name) => post('simulator/scenario', { scenario: name });
  const original = (await snapshot()).automations.settings;
  const configure = async (settings) => {
    const before = await snapshot();
    const response = await context.request.put(`${farm}/automations/settings`, {
      headers: { ...headers, 'If-Match': String(before.automations.revision) }, data: settings });
    assert.equal(response.status(), 200);
  };
  const reading = async (key, value, timeout = 10_000) => expect.poll(async () =>
    (await snapshot()).readings[key], { timeout, intervals: [100, 250] }).toBe(value);
  const base = { ...original, irrigation: false, alarm: false, rain: false, cooling: false, lighting: false,
    soilDry: 99, cooldown: 15, maxPulses: 1, tankLow: 20, tankRecover: 30, rainDelay: 2,
    fanOn: 20, fanOff: 18, lightOn: 1500, lightOff: 2000, motionOnly: false };
  const evidence = { observedAt: null, apiSha: health.releaseSha, browser: browser.version(), results: {} };
  try {
    await command({ type: 'farm.allOff' });
    await scenario('normal');
    await configure(base);
    await post('automations/sync-guard');
    await expect.poll(async () => (await snapshot()).automations.runtime.guardConfirmed).toBe(true);
    for (let i = 0; i < 20; i++) {
      const on = i % 2 === 0;
      const accepted = await command({ type: 'fan.set', on });
      assert.ok(accepted.id);
      await reading('fan', on);
    }
    for (const [type, key, field] of [['light.set', 'led', 'on'], ['feeder.set', 'feederOpen', 'open'],
      ['lcd.setBacklight', 'backlight', 'on']]) {
      for (const value of [true, false]) { await command({ type, [field]: value }); await reading(key, value); }
    }
    await command({ type: 'lcd.setText', line1: 'G08 SIMULATOR', line2: 'HOSTED CHECK' });
    await expect.poll(async () => (await snapshot()).lcd.line1).toBe('G08 SIMULATOR');
    let beepObserved = false;
    for (let attempt = 0; attempt < 4 && !beepObserved; attempt++) {
      await command({ type: 'buzzer.beep', frequencyHz: 880 });
      beepObserved = (await snapshot()).readings.buzzer === true;
    }
    assert.equal(beepObserved, true, 'Short simulated beep was never observed in telemetry');
    await command({ type: 'buzzer.stop' });
    await reading('buzzer', false);
    await command({ type: 'pump.pulse' });
    await reading('pump', true);
    await reading('pump', false);
    evidence.results.manual = { fan: true, light: true, feeder: true, lcdText: true, backlight: true,
      simulatedPumpOnAndOff: true, buzzerStop: true, beepObserved: true, guardConfirmed: true };
    await command({ type: 'farm.allOff' });
    await configure({ ...base, cooling: true, lighting: true, alarm: true });
    for (const rule of ['cooling', 'lighting', 'alarm']) await post('automations/resume-rule', { rule });
    const page = await context.newPage();
    await page.goto('/automations');
    await expect(page.getByTestId('automation-editor')).toBeVisible();
    await page.getByTestId('start-automations').click();
    await reading('fan', true);
    await scenario('dht-failure');
    await reading('dhtHealthy', false);
    assert.equal((await snapshot()).readings.fan, true);
    await scenario('normal');
    await configure({ ...base, cooling: true, lighting: true, alarm: true, fanOn: 30, fanOff: 28 });
    await reading('fan', false);
    await scenario('night');
    await reading('led', true);
    await scenario('normal');
    await reading('led', false);
    await scenario('empty-tank');
    await expect.poll(async () => (await snapshot()).automations.runtime.alarmActive).toBe(true);
    await expect.poll(async () => (await snapshot()).lcd.line1).toBe('TANK LOW');
    await reading('backlight', true);
    await reading('pump', false);
    await scenario('normal');
    await expect.poll(async () => (await snapshot()).automations.runtime.alarmActive).toBe(false);
    evidence.results.cooling = { onAndOff: true, dhtFailureLeavesFanUnchanged: true };
    evidence.results.lighting = { darkOn: true, daylightOff: true };
    evidence.results.alarm = { lowTankAlarmAndLcd: true, backlightOn: true, recovery: true };
    await command({ type: 'farm.allOff' });
    await configure({ ...base, irrigation: true, rain: true });
    await scenario('rain');
    await post('automations/reset-watering');
    await post('automations/resume-rule', { rule: 'irrigation' });
    await post('automations/start');
    await new Promise((resolve) => setTimeout(resolve, 16_000));
    let snap = await snapshot();
    assert.equal(snap.readings.pump, false);
    assert.equal(snap.automations.runtime.attempts, 0);
    assert.match(snap.automations.runtime.messages.irrigation, /rain protection/i);
    await page.close();
    const quietStart = Date.now();
    await scenario('normal');
    const afterLastRequest = Date.now();
    // No browser pages, sockets or API polling from this test during the pulse.
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const quietEnd = Date.now();
    snap = await snapshot();
    assert.equal(snap.automations.runtime.attempts, 1);
    assert.equal(snap.readings.pump, false);
    const eventsResponse = await context.request.get(`${farm}/events?category=command.accepted&limit=100`);
    assert.equal(eventsResponse.status(), 200);
    const pulseEvent = (await eventsResponse.json()).events.find((item) => item.details.action === 'pump.pulse'
      && Date.parse(item.createdAt) >= quietStart && Date.parse(item.createdAt) < quietEnd);
    assert.ok(pulseEvent?.commandId, 'No server-created pulse recorded during the no-polling window.');
    const pulseResponse = await context.request.get(`${farm}/commands/${pulseEvent.commandId}`);
    assert.equal(pulseResponse.status(), 200);
    const pulse = await pulseResponse.json();
    assert.equal(pulse.status, 'state_matched', 'Automatic pump-on telemetry was not observed.');
    evidence.results.rain = { blockedBeyondSettlingWait: true, dryRecovery: true };
    evidence.results.irrigation = { oneAutomaticPulse: true, stopped: true, afterPageClosed: true,
      noPollingWindowMs: quietEnd - afterLastRequest, recordedPulseStatus: pulse.status };
  } finally {
    await command({ type: 'farm.allOff' });
    await scenario('normal');
    await configure(original);
    await post('automations/sync-guard');
    await expect.poll(async () => (await snapshot()).automations.runtime.guardConfirmed).toBe(true);
  }
  durations.sort((a, b) => a - b);
  evidence.observedAt = new Date().toISOString();
  evidence.commandAcceptanceMs = { count: durations.length, p50: durations[Math.ceil(durations.length * 0.5) - 1],
    p95: durations[Math.ceil(durations.length * 0.95) - 1], max: durations.at(-1) };
  evidence.settingsRestored = true;
  evidence.outputsOffAndAutomationsPaused = true;
  await writeFile(new URL('../../.infra/staging-automations-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
