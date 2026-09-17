import { TELEMETRY_TOPIC } from '@smartfarm/contracts';
import mqtt from 'mqtt';
import { afterEach, describe, expect, it } from 'vitest';
import { startLoopbackBroker } from './broker';
import { startMqttSimulator } from './mqtt-runner';

describe('MQTT simulator', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()?.();
  });

  it('publishes firmware-shaped telemetry on a loopback broker', async () => {
    const broker = await startLoopbackBroker(0);
    cleanups.push(broker.close);
    const url = `mqtt://127.0.0.1:${broker.port}`;
    const sim = startMqttSimulator({ url, scenario: 'normal' });
    cleanups.push(sim.stop);

    const packet = await new Promise<string>((resolve, reject) => {
      const client = mqtt.connect(url);
      const timer = setTimeout(() => reject(new Error('no telemetry')), 4000);
      client.on('connect', () => client.subscribe(TELEMETRY_TOPIC));
      client.on('message', (_topic, payload) => {
        clearTimeout(timer);
        client.end(true);
        resolve(payload.toString());
      });
    });

    const data = JSON.parse(packet) as { t: number; guard: number };
    expect(data.t).toBe(24);
    expect(data.guard).toBe(1);
  });
});
