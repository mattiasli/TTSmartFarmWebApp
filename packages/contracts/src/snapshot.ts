import type { AutomationRuntimeView, AutomationSettings } from './automations';
import type { CommandDto } from './commands';
import type { FarmMode } from './realtime';
import type { WireTelemetry } from './telemetry';

export const LOCAL_FARM_ID = '11111111-1111-4111-8111-111111111111';
export const LOCAL_FARM_NAME = 'TT SmartFarm';

export type ControllerOwnership = 'owner' | 'waiting_for_owner' | 'draining';

export type ConnectionView = {
  controllerReady: boolean;
  brokerReady: boolean;
  fresh: boolean;
  telemetryAgeMs: number | null;
  transport: 'memory' | 'mqtt';
  status: 'live' | 'stale' | 'offline';
  ownership: ControllerOwnership;
  controllerEpoch: string;
  mqttEpoch: string | null;
};

export type NormalizedReadings = {
  temperatureC: number | null;
  humidityPct: number | null;
  dhtHealthy: boolean | null;
  soilPct: number | null;
  waterPct: number | null;
  lightRaw: number | null;
  steamRaw: number | null;
  rain: boolean | null;
  distanceCm: number | null;
  pir: boolean | null;
  button: boolean | null;
  rssiDbm: number | null;
  fan: boolean | null;
  led: boolean | null;
  feederOpen: boolean | null;
  pump: boolean | null;
  buzzer: boolean | null;
  backlight: boolean | null;
  guard: boolean | null;
  tankLow: number | null;
  tankRecover: number | null;
  pumpBlocked: 0 | 1 | 2 | null;
};

export type FarmSnapshot = {
  protocolVersion: 1;
  farmId: string;
  farmName: string;
  mode: FarmMode;
  simulation: boolean;
  connection: ConnectionView;
  readings: NormalizedReadings | null;
  wire: WireTelemetry | null;
  lcd: { line1: string; line2: string; remote: boolean };
  pendingCommands: CommandDto[];
  permissions: { canControl: boolean; canView: boolean };
  automations: {
    revision: number;
    settings: AutomationSettings;
    runtime: AutomationRuntimeView;
  };
};

export type SessionDto = {
  authenticated: boolean;
  localLogin: boolean;
  csrfToken: string | null;
  farmId: string | null;
  role: 'viewer' | 'operator' | 'admin' | null;
  username: string | null;
  githubLoginEnabled: boolean;
};
