import mqtt, { type MqttClient } from 'mqtt';
import { TELEMETRY_TOPIC, type WireTelemetry } from '@smartfarm/contracts';
import { assertLoopbackMqttUrl, parseTelemetry } from '@smartfarm/domain';
import { SimulatedFarm } from '@smartfarm/simulator';

export type LatestTelemetry = {
  data: WireTelemetry;
  receivedAtMs: number;
};

export type FarmLink = {
  transport: 'memory' | 'mqtt';
  ready: boolean;
  lcd: { line1: string; line2: string; remote: boolean };
  latest(): LatestTelemetry | null;
  publish(topic: string, payload: string): Promise<void>;
  close(): Promise<void>;
};

export class MemoryFarmLink implements FarmLink {
  readonly transport = 'memory' as const;
  ready = true;
  farm = new SimulatedFarm();
  private started = Date.now();
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

  async publish(topic: string, payload: string) {
    this.farm.applyCommand(topic, payload, Date.now() - this.started);
    this.capture();
  }

  async close() {
    clearInterval(this.timer);
  }

  private capture() {
    this.current = { data: this.farm.snapshot(), receivedAtMs: Date.now() };
  }
}

export class MqttFarmLink implements FarmLink {
  readonly transport = 'mqtt' as const;
  ready = false;
  lcd = { line1: 'Smart Farm MQTT', line2: 'Starting...', remote: false };
  private current: LatestTelemetry | null = null;
  private client: MqttClient;

  constructor(url: string) {
    const parsed = assertLoopbackMqttUrl(url);
    this.client = mqtt.connect(parsed.toString(), {
      clientId: `smartfarm-web-local-${Math.random().toString(16).slice(2)}`,
      clean: true,
      queueQoSZero: false,
      protocolVersion: 4,
    });
    this.client.on('connect', () => {
      this.ready = true;
      this.client.subscribe(TELEMETRY_TOPIC, { qos: 0 });
    });
    this.client.on('offline', () => {
      this.ready = false;
      this.current = null;
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

  async publish(topic: string, payload: string) {
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

export function createFarmLink(transport: 'memory' | 'mqtt', mqttUrl: string): FarmLink {
  if (transport === 'mqtt') return new MqttFarmLink(mqttUrl);
  return new MemoryFarmLink();
}
