import mqtt from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AUTOMATIONS, HEALTHY_TELEMETRY_FIXTURE, TELEMETRY_TOPIC } from '@smartfarm/contracts';
import { loadConfig } from '../../apps/api/src/config';
import { FarmController } from '../../apps/api/src/controller';
import { MqttFarmLink } from '../../apps/api/src/farm-link';
import { startLoopbackBroker } from '../../tools/simulator/src/broker';

describe('P09 local MQTT automation sequences', () => {
  let broker: Awaited<ReturnType<typeof startLoopbackBroker>>;
  let publisher: mqtt.MqttClient;

  beforeAll(async () => {
    broker = await startLoopbackBroker(0);
    publisher = mqtt.connect(`mqtt://127.0.0.1:${broker.port}`, {
      clientId: `smartfarm-auto-pub-${crypto.randomUUID().slice(0, 8)}`,
      clean: true,
      protocolVersion: 4,
    });
    await new Promise<void>((resolve, reject) => {
      publisher.once('connect', () => resolve());
      publisher.once('error', reject);
    });
  }, 15_000);

  afterAll(async () => {
    await Promise.race([
      new Promise<void>((resolve) => publisher.end(true, {}, () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    ]);
    await broker.close();
  }, 10_000);

  async function publishTelemetry(data = HEALTHY_TELEMETRY_FIXTURE) {
    await new Promise<void>((resolve, reject) => {
      publisher.publish(TELEMETRY_TOPIC, JSON.stringify(data), { qos: 0, retain: false }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  it('emits an automation command sequence on the local broker', async () => {
    const url = `mqtt://127.0.0.1:${broker.port}`;
    const link = new MqttFarmLink(url);
    await link.whenReady?.(8000);
    const received: Array<{ topic: string; payload: string }> = [];
    const watcher = mqtt.connect(url, {
      clientId: `smartfarm-auto-watch-${crypto.randomUUID().slice(0, 8)}`,
      clean: true,
      protocolVersion: 4,
    });
    await new Promise<void>((resolve, reject) => {
      watcher.once('connect', () => resolve());
      watcher.once('error', reject);
    });
    await new Promise<void>((resolve, reject) => {
      watcher.subscribe('smartfarm/cmd/#', { qos: 0 }, (error) => (error ? reject(error) : resolve()));
    });
    watcher.on('message', (topic, payload) => {
      received.push({ topic, payload: payload.toString() });
    });
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => Date.now(),
      null,
      {
        ownership: 'owner',
        settings: {
          ...DEFAULT_AUTOMATIONS,
          irrigation: false,
          alarm: false,
          cooling: false,
          lighting: true,
          lightOn: 3380,
          lightOff: 3560,
        },
      },
    );
    try {
      await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, light: 2559, led: 0 });
      const liveAt = Date.now();
      while (!controller.snapshot().readings) {
        if (Date.now() - liveAt > 4000) throw new Error('Did not receive loopback telemetry.');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      controller.startAutomations();
      const litAt = Date.now();
      while (!received.some((row) => row.topic.endsWith('/led') && row.payload === 'on')) {
        if (Date.now() - litAt > 4000) throw new Error('Night-light command was not published on the local broker.');
        controller.snapshot();
        await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, light: 2559, led: 0 });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(received.filter((row) => row.topic.endsWith('/led') && row.payload === 'on').length).toBeGreaterThan(0);
      expect(received.some((row) => row.topic.endsWith('/pump'))).toBe(false);
    } finally {
      await controller.close();
      await Promise.race([
        new Promise<void>((resolve) => watcher.end(true, {}, () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
  });
});
