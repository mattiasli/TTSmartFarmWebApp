import mqtt from 'mqtt';
import { COMMAND_TOPIC_PREFIX, TELEMETRY_TOPIC } from '@smartfarm/contracts';
import { assertLoopbackMqttUrl } from '@smartfarm/domain';
import { SimulatedFarm } from './farm-model';

const TELEMETRY_MS = 800;

export function startMqttSimulator(options: {
  url: string;
  scenario: string;
  farm?: SimulatedFarm;
}) {
  const url = assertLoopbackMqttUrl(options.url).toString();
  const farm = options.farm ?? new SimulatedFarm();
  farm.applyScenario(options.scenario);
  const client = mqtt.connect(url, {
    clientId: `smartfarm-sim-${Math.random().toString(16).slice(2)}`,
    clean: true,
    reconnectPeriod: 1000,
    queueQoSZero: false,
  });

  const started = Date.now();
  const tick = () => {
    const now = Date.now() - started;
    farm.tick(now);
    if (client.connected) {
      client.publish(TELEMETRY_TOPIC, JSON.stringify(farm.snapshot()), { qos: 0, retain: false });
    }
  };

  client.on('connect', () => {
    client.subscribe(`${COMMAND_TOPIC_PREFIX}#`, { qos: 0 });
  });
  client.on('message', (topic, payload) => {
    farm.applyCommand(topic, payload.toString(), Date.now() - started);
  });

  const interval = setInterval(tick, TELEMETRY_MS);
  tick();

  return {
    farm,
    client,
    stop: async () => {
      clearInterval(interval);
      await new Promise<void>((resolve) => client.end(true, {}, () => resolve()));
    },
  };
}
