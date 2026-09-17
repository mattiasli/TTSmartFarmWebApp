import { HEALTHY_TELEMETRY_FIXTURE, LEGACY_TELEMETRY_FIXTURE, type WireTelemetry } from '@smartfarm/contracts';

export const SCENARIO_NAMES = [
  'normal',
  'empty-tank',
  'rain',
  'night',
  'dht-failure',
  'legacy',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export function scenarioTelemetry(name: string): WireTelemetry {
  switch (name) {
    case 'empty-tank':
      return { ...HEALTHY_TELEMETRY_FIXTURE, water: 8, pumpBlocked: 1 };
    case 'rain':
      return { ...HEALTHY_TELEMETRY_FIXTURE, steam: 900, rain: 1 };
    case 'night':
      return { ...HEALTHY_TELEMETRY_FIXTURE, light: 900, led: 0 };
    case 'dht-failure':
      return { ...HEALTHY_TELEMETRY_FIXTURE, dht: 0, t: -99, h: -1 };
    case 'legacy':
      return { ...LEGACY_TELEMETRY_FIXTURE };
    case 'normal':
    default:
      return { ...HEALTHY_TELEMETRY_FIXTURE };
  }
}
