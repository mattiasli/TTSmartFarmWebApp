// Run with: node --import tsx tools/scripts/observe-live-telemetry.mjs
// Reads existing ignored private setup; never publishes or saves credentials.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createConfiguredFarmLink } from '../../apps/api/src/farm-link.ts';

const setup = Object.fromEntries((await readFile('private-setup/smartfarm_setup.txt', 'utf8'))
  .split(/\r?\n/).map((line) => /^([A-Z_]+)=(.*)$/.exec(line))
  .filter(Boolean).map((match) => [match[1], match[2].trim()]));
const config = loadConfig({
  NODE_ENV: 'production', APP_ENV: 'local', FARM_MODE: 'live',
  HIVEMQ_HOST: setup.HIVEMQ_HOST, HIVEMQ_USERNAME: setup.HIVEMQ_USERNAME,
  HIVEMQ_PASSWORD: setup.HIVEMQ_PASSWORD,
  LIVE_COMMANDS_ENABLED: 'false', LIVE_PUMP_ENABLED: 'false',
});
assert.equal(config.LIVE_COMMANDS_ENABLED, false);
assert.equal(config.LIVE_PUMP_ENABLED, false);
const link = createConfiguredFarmLink(config);
const started = Date.now();
const evidence = {
  startedAt: new Date(started).toISOString(), transport: 'mqtts', execution: 'local read-only observer',
  certificateVerification: true, liveCommandsEnabled: false, livePumpEnabled: false,
  sharedCredentialException: 'User requested reuse for initial read-only connection.',
  commandPublishCalls: 0, samples: 0, fields: [], epochs: [],
  physicalSensorStimuliVerified: false, firmwareIdentityVerified: false,
};
let lastReceived = 0;
let maxGapMs = 0;
const fields = new Set();
const epochs = new Set();
try {
  await link.whenReady(15_000);
  console.log('Verified TLS MQTT connection and telemetry subscription established; publishing disabled.');
  while (Date.now() - started < 180_000) {
    const latest = link.latest();
    if (latest && latest.receivedAtMs !== lastReceived) {
      if (lastReceived) maxGapMs = Math.max(maxGapMs, latest.receivedAtMs - lastReceived);
      lastReceived = latest.receivedAtMs;
      evidence.samples++;
      Object.keys(latest.data).forEach((key) => fields.add(key));
      epochs.add(link.mqttEpoch);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  evidence.telemetryObserved = evidence.samples > 0;
  evidence.maxObservedGapMs = maxGapMs;
  evidence.lastTelemetryAgeMs = lastReceived ? Date.now() - lastReceived : null;
} catch {
  evidence.connectionFailed = true;
  process.exitCode = 1;
} finally {
  await link.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.fields = [...fields].sort();
  evidence.epochs = [...epochs];
  await mkdir('.infra', { recursive: true });
  await writeFile('.infra/live-readonly-observation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
