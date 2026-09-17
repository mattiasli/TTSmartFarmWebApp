import { SimulatedFarm } from './farm-model';

const scenario = process.argv.includes('--scenario')
  ? process.argv[process.argv.indexOf('--scenario') + 1]
  : 'normal';

const farm = new SimulatedFarm();
if (scenario === 'empty-tank') {
  farm.data.water = 8;
  farm.tick(0);
}

console.log(
  JSON.stringify(
    {
      simulator: true,
      scenario,
      sample: farm.snapshot(),
      lcd: farm.lcd,
      note: 'MQTT transport is added in the rest of P04. This model matches firmware pulse, beep, and all-off limits.',
    },
    null,
    2,
  ),
);
