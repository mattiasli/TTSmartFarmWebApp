import mqtt from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEALTHY_TELEMETRY_FIXTURE, TELEMETRY_TOPIC } from '@smartfarm/contracts';
import { loadConfig } from '../../apps/api/src/config';
import { FarmController } from '../../apps/api/src/controller';
import { DEFAULT_AUTOMATIONS } from '@smartfarm/contracts';
import { MqttFarmLink } from '../../apps/api/src/farm-link';
import { startLoopbackBroker } from '../../tools/simulator/src/broker';

describe('P08 local MQTT command confirmation', () => {
  let broker: Awaited<ReturnType<typeof startLoopbackBroker>>;
  let publisher: mqtt.MqttClient;

  beforeAll(async () => {
    broker = await startLoopbackBroker(0);
    publisher = mqtt.connect(`mqtt://127.0.0.1:${broker.port}`, {
      clientId: `smartfarm-test-pub-${crypto.randomUUID().slice(0, 8)}`,
      clean: true,
      protocolVersion: 4,
    });
    await new Promise<void>((resolve, reject) => {
      publisher.once('connect', () => resolve());
      publisher.once('error', reject);
    });
  }, 15_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => publisher.end(true, {}, () => resolve()));
    await broker.close();
  });

  async function publishTelemetry(data = HEALTHY_TELEMETRY_FIXTURE) {
    await new Promise<void>((resolve, reject) => {
      publisher.publish(TELEMETRY_TOPIC, JSON.stringify(data), { qos: 0, retain: false }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  it('T021/T022 matches only newer local-broker telemetry', async () => {
    const url = `mqtt://127.0.0.1:${broker.port}`;
    const link = new MqttFarmLink(url);
    await link.whenReady?.(8000);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }),
      link,
      () => Date.now(),
      null,
      { ownership: 'owner' },
    );
    try {
      await publishTelemetry();
      const started = Date.now();
      while (!controller.snapshot().readings) {
        if (Date.now() - started > 4000) throw new Error('Did not receive loopback telemetry.');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const command = await controller.command({ type: 'fan.set', on: true }, crypto.randomUUID());
      expect(command.status).toBe('sent');
      await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, fan: 0 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(controller.getCommand(command.id)?.status).toBe('sent');
      await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, fan: 1 });
      const matchedAt = Date.now();
      while (controller.getCommand(command.id)?.status !== 'state_matched') {
        if (Date.now() - matchedAt > 4000) throw new Error('Newer matching packet did not confirm the command.');
        await new Promise((resolve) => setTimeout(resolve, 50));
        controller.snapshot();
      }
    } finally {
      await controller.close();
    }
  });

  it('T028/S09 survives a real broker restart without queued actuation or automatic resume', async () => {
    const port = broker.port;
    const link = new MqttFarmLink(`mqtt://127.0.0.1:${port}`);
    await link.whenReady(8000);
    const controller = new FarmController(
      loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' }), link,
      () => Date.now(), null, { ownership: 'owner', settings: { ...DEFAULT_AUTOMATIONS,
        irrigation: false, alarm: false, cooling: false, lighting: true, lightOn: 3380, lightOff: 3560 } },
    );
    try {
      await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, light: 2559, led: 0 });
      await expect.poll(() => controller.snapshot().connection.fresh).toBe(true);
      controller.startAutomations();
      expect(controller.snapshot().automations.runtime.masterEnabled).toBe(true);
      const oldEpoch = link.mqttEpoch;
      await broker.close();
      await expect.poll(() => link.ready).toBe(false);
      await expect.poll(() => controller.snapshot().automations.runtime.masterEnabled).toBe(false);
      await expect(controller.command({ type: 'fan.set', on: true }, crypto.randomUUID())).rejects.toThrow();
      await expect(link.publish('smartfarm/cmd/fan', 'on')).rejects.toThrow(/not ready/);
      const received: Array<{ topic: string; payload: string }> = [];
      broker = await startLoopbackBroker(port, (topic, payload) => {
        if (topic.startsWith('smartfarm/cmd/')) received.push({ topic, payload: payload.toString() });
      });
      await link.whenReady(8000);
      await expect.poll(() => publisher.connected).toBe(true);
      expect(link.mqttEpoch).not.toBe(oldEpoch);
      expect(controller.snapshot().connection.fresh).toBe(false);
      await publishTelemetry({ ...HEALTHY_TELEMETRY_FIXTURE, light: 2559, led: 0 });
      await expect.poll(() => controller.snapshot().connection.fresh).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(controller.snapshot().automations.runtime.masterEnabled).toBe(false);
      expect(received.some((item) => item.payload === 'on' || item.payload === 'pulse')).toBe(false);
      controller.startAutomations();
      await expect.poll(() => received.some((item) => item.topic.endsWith('/led') && item.payload === 'on')).toBe(true);
    } finally {
      await controller.close();
    }
  });
});
