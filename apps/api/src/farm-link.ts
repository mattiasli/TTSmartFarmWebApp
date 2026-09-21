import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import { TELEMETRY_TOPIC, type WireTelemetry } from '@smartfarm/contracts';
import { assertLoopbackMqttUrl, parseTelemetry, scenarioTelemetry, type ScenarioName } from '@smartfarm/domain';
import { SimulatedFarm } from '@smartfarm/simulator';
import type { AppConfig } from './config';

export type LatestTelemetry = {
  data: WireTelemetry;
  receivedAtMs: number;
};

export type FarmLink = {
  transport: 'memory' | 'mqtt';
  ready: boolean;
  mqttEpoch: string;
  lcd: { line1: string; line2: string; remote: boolean };
  latest(): LatestTelemetry | null;
  publish(topic: string, payload: string): Promise<void>;
  close(): Promise<void>;
  awaitHold?(): Promise<void>;
  whenReady?(timeoutMs?: number): Promise<void>;
};

function newEpoch() {
  return crypto.randomUUID();
}

export class MemoryFarmLink implements FarmLink {
  readonly transport = 'memory' as const;
  ready = true;
  mqttEpoch = newEpoch();
  farm = new SimulatedFarm();
  private started = Date.now();
  private telemetryMutedUntil = 0;
  private current: LatestTelemetry | null = null;
  private timer: ReturnType<typeof setInterval>;

  constructor() {
    this.capture();
    this.timer = setInterval(() => {
      this.farm.tick(Date.now() - this.started);
      this.capture();
    }, 250);
  }

  get lcd() {
    return { ...this.farm.lcd, remote: this.farm.lcdRemote };
  }

  latest() {
    return this.current;
  }

  setScenario(name: ScenarioName) {
    this.telemetryMutedUntil = 0;
    // Change sensor conditions without fabricating actuator confirmations or
    // losing the pump guard settings already applied by the controller.
    const { fan, led, feed, pump, buzz, bl, guard, tankLow, tankRecover, pumpBlocked } = this.farm.data;
    this.farm.data = { ...scenarioTelemetry(name), fan, led, feed, pump, buzz, bl,
      guard, tankLow, tankRecover, pumpBlocked };
    this.farm.tick(Date.now() - this.started);
    this.capture();
  }

  silenceTelemetry() {
    // A bounded fixture: device timers keep running and telemetry always recovers.
    this.telemetryMutedUntil = Date.now() + 8000;
  }

  async publish(topic: string, payload: string) {
    this.farm.applyCommand(topic, payload, Date.now() - this.started);
    this.capture();
  }

  async close() {
    clearInterval(this.timer);
  }

  private capture() {
    if (Date.now() < this.telemetryMutedUntil) return;
    this.current = { data: this.farm.snapshot(), receivedAtMs: Date.now() };
  }
}

export class ScriptedFarmLink implements FarmLink {
  readonly transport = 'mqtt' as const;
  ready = true;
  mqttEpoch = newEpoch();
  lcd = { line1: 'Scripted', line2: '', remote: false };
  deferPublishes = false;
  private current: LatestTelemetry | null = null;
  published: Array<{ topic: string; payload: string; epoch: string }> = [];
  private waiters: Array<(error?: Error) => void> = [];

  latest() {
    return this.current;
  }

  inject(data: WireTelemetry, receivedAtMs = Date.now(), retain = false) {
    if (retain) return;
    this.current = { data, receivedAtMs };
  }

  disconnect() {
    this.ready = false;
    this.current = null;
  }

  reconnect() {
    this.ready = true;
    this.mqttEpoch = newEpoch();
    this.current = null;
  }

  releasePublishes(error?: Error) {
    this.deferPublishes = false;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter(error);
  }

  get waiting() {
    return this.waiters.length;
  }

  awaitHold() {
    if (!this.deferPublishes) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.waiters.push((error) => (error ? reject(error) : resolve()));
    });
  }

  async publish(topic: string, payload: string) {
    if (!this.ready) throw new Error('MQTT client is not ready.');
    this.published.push({ topic, payload, epoch: this.mqttEpoch });
  }

  async close() {
    this.ready = false;
    this.releasePublishes(new Error('MQTT client is not ready.'));
  }
}

class BrokerFarmLink implements FarmLink {
  readonly transport = 'mqtt' as const;
  ready = false;
  mqttEpoch = newEpoch();
  lcd = { line1: 'Smart Farm MQTT', line2: 'Starting...', remote: false };
  private current: LatestTelemetry | null = null;
  private client: MqttClient;

  constructor(url: string, options: IClientOptions = {}, private readonly commandsEnabled = true) {
    this.client = mqtt.connect(url, {
      ...options,
      clientId: `smartfarm-web-${this.mqttEpoch.slice(0, 8)}`,
      clean: true,
      queueQoSZero: false,
      // Subscribe explicitly on each connection so readiness follows its SUBACK.
      resubscribe: false,
      protocolVersion: 4,
      reconnectPeriod: 2000,
    });
    this.client.on('connect', () => {
      this.mqttEpoch = newEpoch();
      this.current = null;
      this.ready = false;
      this.client.subscribe(TELEMETRY_TOPIC, { qos: 0 }, (error, grants) => {
        this.ready = !error && Boolean(grants?.some((grant) =>
          grant.topic === TELEMETRY_TOPIC && grant.qos !== 128));
      });
    });
    this.client.on('offline', () => {
      this.ready = false;
      this.current = null;
    });
    this.client.on('close', () => {
      this.ready = false;
      this.current = null;
    });
    this.client.on('error', () => {
      this.ready = false;
    });
    this.client.on('message', (topic, payload, packet) => {
      if (topic !== TELEMETRY_TOPIC || packet.retain) return;
      try {
        const parsedTelemetry = parseTelemetry(payload);
        this.current = { data: parsedTelemetry.data, receivedAtMs: Date.now() };
      } catch {
        // Invalid packets never refresh freshness.
      }
    });
  }

  latest() {
    return this.current;
  }

  whenReady(timeoutMs = 5000) {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (this.ready) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('MQTT client did not become ready.'));
        }
      }, 20);
    });
  }

  async publish(topic: string, payload: string) {
    if (!this.commandsEnabled) throw new Error('Live MQTT publishing is disabled.');
    if (!this.ready) throw new Error('MQTT client is not ready.');
    await new Promise<void>((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 0, retain: false }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async close() {
    this.ready = false;
    await new Promise<void>((resolve) => this.client.end(true, {}, () => resolve()));
  }
}

export class MqttFarmLink extends BrokerFarmLink {
  constructor(url: string) {
    super(assertLoopbackMqttUrl(url).toString());
  }
}

export class LiveMqttFarmLink extends BrokerFarmLink {
  constructor(config: AppConfig) {
    if (config.FARM_MODE !== 'live' || config.APP_ENV === 'staging') {
      throw new Error('Live MQTT requires live mode outside simulator staging.');
    }
    const host = config.HIVEMQ_HOST;
    // A bare DNS hostname prevents URL credentials, paths or protocol overrides.
    if (!host || host.length > 253 || !host.split('.').every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      !config.HIVEMQ_USERNAME?.trim() || !config.HIVEMQ_PASSWORD) {
      throw new Error('Live MQTT requires a bare HIVEMQ_HOST and backend credentials.');
    }
    super(`mqtts://${host}:${config.HIVEMQ_MQTT_TLS_PORT}`, {
      username: config.HIVEMQ_USERNAME,
      password: config.HIVEMQ_PASSWORD,
      rejectUnauthorized: true,
      servername: host,
      connectTimeout: 10_000,
    }, config.LIVE_COMMANDS_ENABLED);
  }
}

export function createConfiguredFarmLink(config: AppConfig): FarmLink {
  return config.FARM_MODE === 'live'
    ? new LiveMqttFarmLink(config)
    : createFarmLink(config.SIMULATOR_TRANSPORT, config.SIMULATOR_MQTT_URL);
}

export function createFarmLink(transport: 'memory' | 'mqtt', mqttUrl: string): FarmLink {
  if (transport === 'mqtt') return new MqttFarmLink(mqttUrl);
  return new MemoryFarmLink();
}
