import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { auditCommandRetention } from './audit-command-retention.mjs';
import { assertReadOnlyProductionHealth } from './production-release-policy.mjs';

const target = JSON.parse(await readFile('tools/deploy/production.json', 'utf8'));
const response = await fetch(`${target.api}/health/ready`, { signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 200);
const health = await response.json();
assertReadOnlyProductionHealth(health);
const setup = Object.fromEntries((await readFile('private-setup/smartfarm_setup.txt', 'utf8'))
  .split(/\r?\n/).map((line) => /^([A-Z_]+)=(.*)$/.exec(line)).filter(Boolean)
  .map((match) => [match[1], match[2].trim()]));
const host = setup.HIVEMQ_HOST;
assert.ok(host && host.length <= 253 && host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
assert.ok(setup.HIVEMQ_USERNAME && setup.HIVEMQ_PASSWORD);
try {
  const evidence = await auditCommandRetention(`mqtts://${host}:8883`, {
    username: setup.HIVEMQ_USERNAME, password: setup.HIVEMQ_PASSWORD,
    rejectUnauthorized: true, servername: host,
  });
  evidence.sourceSha = health.releaseSha;
  evidence.certificateVerification = true;
  evidence.sharedCredentialException = 'Existing credential reused for read-only subscription audit.';
  evidence.retainedMessagesCleared = 0;
  evidence.limitation = 'Observed broker delivery during a bounded subscription; not a permanent guarantee or proof that other controllers are stopped.';
  await mkdir('.infra', { recursive: true });
  await writeFile('.infra/live-command-retention.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch {
  console.error('Read-only MQTT audit failed; no commands published or cleared.');
  process.exitCode = 1;
}
