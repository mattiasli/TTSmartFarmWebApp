import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TELEMETRY_TOPIC } from '@smartfarm/contracts';
import { scenarioTelemetry } from '@smartfarm/domain';
import mqtt from 'mqtt';
import { loadConfig, redactedConfig } from './config';
import { createConfiguredFarmLink, LiveMqttFarmLink, MemoryFarmLink } from './farm-link';

vi.mock('mqtt', () => ({ default: { connect: vi.fn() } }));

class Client extends EventEmitter {
  grant = 0;
  subscribe = vi.fn((_topic, _options, callback) =>
    callback(null, [{ topic: TELEMETRY_TOPIC, qos: this.grant }]));
  publish = vi.fn((_topic, _payload, _options, callback) => callback());
  end = vi.fn((_force, _options, callback) => callback());
}

const live = (commands = false) => loadConfig({
  NODE_ENV: 'test', APP_ENV: 'production', FARM_MODE: 'live',
  GITHUB_OAUTH_CLIENT_ID: 'fixture', HIVEMQ_HOST: 'broker.example.test',
  HIVEMQ_USERNAME: 'backend-fixture', HIVEMQ_PASSWORD: 'fixture-password',
  LIVE_COMMANDS_ENABLED: String(commands), LIVE_PUMP_ENABLED: 'false',
});

describe('configured farm transport', () => {
  let client: Client;
  beforeEach(() => {
    client = new Client();
    vi.mocked(mqtt.connect).mockReturnValue(client as unknown as ReturnType<typeof mqtt.connect>);
  });

  it('uses authenticated, verified TLS for live mode and never falls back to a simulator', async () => {
    const config = live();
    const link = createConfiguredFarmLink(config);
    expect(link).toBeInstanceOf(LiveMqttFarmLink);
    expect(mqtt.connect).toHaveBeenCalledWith('mqtts://broker.example.test:8883', expect.objectContaining({
      username: 'backend-fixture', password: 'fixture-password', rejectUnauthorized: true,
      servername: 'broker.example.test', clean: true, queueQoSZero: false, resubscribe: false, protocolVersion: 4,
    }));
    expect(JSON.stringify(redactedConfig(config))).not.toContain('fixture-password');
    client.emit('connect');
    expect(link.ready).toBe(true);
    await expect(link.publish('smartfarm/cmd/fan', 'on')).rejects.toThrow('publishing is disabled');
    await link.close();
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('rejects missing credentials, URL overrides and staging live connections before opening a socket', () => {
    for (const config of [
      { ...live(), HIVEMQ_PASSWORD: undefined },
      { ...live(), HIVEMQ_HOST: 'mqtts://user:password@broker.test' },
      { ...live(), APP_ENV: 'staging' as const },
    ]) expect(() => createConfiguredFarmLink(config)).toThrow();
    expect(mqtt.connect).not.toHaveBeenCalled();
  });

  it('keeps simulator mode independent of any configured live credentials', async () => {
    const link = createConfiguredFarmLink({ ...live(), APP_ENV: 'staging', FARM_MODE: 'simulator' });
    expect(link).toBeInstanceOf(MemoryFarmLink);
    expect(mqtt.connect).not.toHaveBeenCalled();
    await link.close();
  });

  it('requires granted telemetry access and fresh non-retained packets after reconnect', async () => {
    const link = createConfiguredFarmLink(live());
    client.grant = 128;
    client.emit('connect');
    expect(link.ready).toBe(false);
    client.grant = 0;
    client.emit('connect');
    const epoch = link.mqttEpoch;
    const payload = Buffer.from(JSON.stringify(scenarioTelemetry('normal')));
    client.emit('message', TELEMETRY_TOPIC, payload, { retain: true });
    expect(link.latest()).toBeNull();
    client.emit('message', TELEMETRY_TOPIC, payload, { retain: false });
    expect(link.latest()).not.toBeNull();
    client.emit('close');
    expect(link.ready).toBe(false);
    expect(link.latest()).toBeNull();
    client.emit('connect');
    expect(link.mqttEpoch).not.toBe(epoch);
    expect(link.latest()).toBeNull();
    await link.close();
  });

  it('publishes only when enabled and connected, with QoS zero and retain false', async () => {
    const link = createConfiguredFarmLink(live(true));
    await expect(link.publish('smartfarm/cmd/fan', 'on')).rejects.toThrow('not ready');
    client.emit('connect');
    await link.publish('smartfarm/cmd/fan', 'on');
    expect(client.publish).toHaveBeenCalledExactlyOnceWith('smartfarm/cmd/fan', 'on',
      { qos: 0, retain: false }, expect.any(Function));
    client.emit('close');
    await expect(link.publish('smartfarm/cmd/fan', 'on')).rejects.toThrow('not ready');
    await link.close();
  });
});
