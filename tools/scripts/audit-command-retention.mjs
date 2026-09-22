import assert from 'node:assert/strict';
import { connect } from 'mqtt';

export const AUDIT_FILTERS = ['smartfarm/cmd/#', 'smartfarm/fan/set', 'smartfarm/telemetry'];

export async function auditCommandRetention(url, options, observeMs = 30000) {
  const evidence = { startedAt: new Date().toISOString(), filters: AUDIT_FILTERS,
    subscribed: false, commandPublishCalls: 0, freshTelemetryPackets: 0,
    retainedCommands: [], observedLiveCommands: [], observationMs: observeMs };
  const client = connect(url, { ...options, clean: true, reconnectPeriod: 0,
    resubscribe: false, queueQoSZero: false, manualConnect: true, connectTimeout: 10000 });
  let deadline;
  let observation;
  try {
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error('MQTT audit connection/subscription failed.'));
      deadline = setTimeout(fail, observeMs + 15000);
      client.on('error', fail);
      client.on('close', fail);
      client.on('packetsend', (packet) => { if (packet.cmd === 'publish') evidence.commandPublishCalls++; });
      client.on('message', (topic, payload, packet) => {
        if (topic === 'smartfarm/telemetry') {
          if (!packet.retain) evidence.freshTelemetryPackets++;
          return;
        }
        if (!topic.startsWith('smartfarm/cmd/') && topic !== 'smartfarm/fan/set') return;
        const record = { topic, payloadBytes: payload.length, observedAt: new Date().toISOString() };
        (packet.retain ? evidence.retainedCommands : evidence.observedLiveCommands).push(record);
      });
      client.once('connect', () => client.subscribe(AUDIT_FILTERS, { qos: 0 }, (error, grants) => {
        if (error || !AUDIT_FILTERS.every((topic) => grants?.some((grant) => grant.topic === topic && grant.qos !== 128))) return fail();
        evidence.subscribed = true;
        observation = setTimeout(resolve, observeMs);
      }));
      client.connect();
    });
    assert.equal(evidence.commandPublishCalls, 0);
    evidence.noRetainedCommandsObserved = evidence.retainedCommands.length === 0;
    evidence.finishedAt = new Date().toISOString();
    return evidence;
  } finally {
    clearTimeout(deadline); clearTimeout(observation);
    await client.endAsync(true);
  }
}
