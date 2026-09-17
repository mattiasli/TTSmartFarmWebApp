import { startLoopbackBroker } from './broker';
import { SimulatedFarm } from './farm-model';
import { startMqttSimulator } from './mqtt-runner';

const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] ?? 'normal' : 'normal';
const url = process.env.SIMULATOR_MQTT_URL ?? 'mqtt://127.0.0.1:1883';

if (args.includes('--broker')) {
  const broker = await startLoopbackBroker(1883);
  console.log(`Loopback MQTT broker listening on mqtt://127.0.0.1:${broker.port}`);
} else if (args.includes('--print')) {
  const farm = new SimulatedFarm();
  farm.applyScenario(scenario);
  console.log(JSON.stringify({ simulator: true, scenario, sample: farm.snapshot(), lcd: farm.lcd }, null, 2));
} else {
  const runner = startMqttSimulator({ url, scenario });
  console.log(`Simulator publishing ${scenario} telemetry to ${url}. Ctrl+C to stop.`);
  const stop = () => {
    void runner.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
