import { AUTOMATION_RANGES, type AutomationSettings, type RuleId } from '@smartfarm/contracts';

export type FieldKey = {
  [K in keyof AutomationSettings]: AutomationSettings[K] extends number ? K : never;
}[keyof AutomationSettings];

export type CardDef = {
  rule: RuleId;
  title: string;
  description: string;
  fields: { key: FieldKey; label: string; unit: string }[];
  motionOnly?: boolean;
};

export const CARDS: CardDef[] = [
  {
    rule: 'irrigation',
    title: 'Water thirsty soil',
    description: 'One pulse, then time to soak in.',
    fields: [
      { key: 'soilDry', label: 'Water below soil moisture', unit: '%' },
      { key: 'cooldown', label: 'Wait between pulses', unit: 's' },
      { key: 'maxPulses', label: 'Maximum consecutive pulses', unit: '' },
    ],
  },
  {
    rule: 'alarm',
    title: 'Watch the water tank',
    description: 'A short beep and LCD warning. Tank protection stays on even if this alarm is off.',
    fields: [
      { key: 'tankLow', label: 'Tank low at', unit: '%' },
      { key: 'tankRecover', label: 'Tank recovered at', unit: '%' },
      { key: 'beepInterval', label: 'Time between beeps', unit: 's' },
    ],
  },
  {
    rule: 'rain',
    title: 'Wait out the rain',
    description: 'Pause automatic watering when the roof plate detects rain (800 or above).',
    fields: [{ key: 'rainDelay', label: 'Wait after rain clears', unit: 's' }],
  },
  {
    rule: 'cooling',
    title: 'A cooling breeze',
    description: 'If the temperatures cross, the other value adjusts to keep off below on.',
    fields: [
      { key: 'fanOn', label: 'Fan on at', unit: '°C' },
      { key: 'fanOff', label: 'Fan off at', unit: '°C' },
    ],
  },
  {
    rule: 'lighting',
    title: 'A cozy night light',
    description: 'Follow the roof light. If thresholds cross, daylight stays above darkness.',
    fields: [
      { key: 'lightOn', label: 'Darkness: light on below', unit: '' },
      { key: 'lightOff', label: 'Daylight: light off above', unit: '' },
      { key: 'motionSeconds', label: 'Light stays on after motion', unit: 's' },
    ],
    motionOnly: true,
  },
];

export function rangeFor(key: FieldKey): readonly [number, number] {
  return AUTOMATION_RANGES[key];
}
