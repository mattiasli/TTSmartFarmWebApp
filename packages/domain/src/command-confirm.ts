import type {
  CommandStatus,
  ConfirmationMode,
  FarmCommandRequest,
  WireTelemetry,
} from '@smartfarm/contracts';

export const STATE_MATCH_MS = 4500;
export const PUMP_WATCHDOG_MS = 8500;
export const PUBLISH_DEADLINE_MS = 2500;

const STOP_TYPES = new Set<FarmCommandRequest['type']>(['pump.stop', 'buzzer.stop', 'farm.allOff']);

export function isStopCommand(type: FarmCommandRequest['type']) {
  return STOP_TYPES.has(type);
}

export function confirmationModeFor(type: FarmCommandRequest['type']): ConfirmationMode {
  if (type === 'pump.pulse') return 'pulse_observation';
  if (type === 'buzzer.beep' || type === 'lcd.setText' || type === 'lcd.showStatus') return 'not_reported';
  return 'state_match';
}

export function actuatorFor(type: FarmCommandRequest['type']): string {
  switch (type) {
    case 'fan.set':
      return 'fan';
    case 'light.set':
      return 'led';
    case 'pump.pulse':
    case 'pump.stop':
      return 'pump';
    case 'buzzer.beep':
    case 'buzzer.stop':
      return 'buzzer';
    case 'feeder.set':
      return 'feeder';
    case 'lcd.setText':
    case 'lcd.showStatus':
      return 'lcd';
    case 'lcd.setBacklight':
      return 'backlight';
    case 'farm.allOff':
      return 'all';
  }
}

export function expectedWireFlag(request: FarmCommandRequest): { key: keyof WireTelemetry; value: 0 | 1 } | null {
  switch (request.type) {
    case 'fan.set':
      return { key: 'fan', value: request.on ? 1 : 0 };
    case 'light.set':
      return { key: 'led', value: request.on ? 1 : 0 };
    case 'feeder.set':
      return { key: 'feed', value: request.open ? 1 : 0 };
    case 'lcd.setBacklight':
      return { key: 'bl', value: request.on ? 1 : 0 };
    case 'pump.stop':
    case 'farm.allOff':
      return { key: 'pump', value: 0 };
    case 'buzzer.stop':
      return { key: 'buzz', value: 0 };
    default:
      return null;
  }
}

export function matchesExpectedState(request: FarmCommandRequest, telemetry: WireTelemetry) {
  const expected = expectedWireFlag(request);
  if (!expected) return false;
  return telemetry[expected.key] === expected.value;
}

export function isPendingStatus(status: CommandStatus) {
  return status === 'accepted' || status === 'publishing' || status === 'sent';
}

export function isPendingCommand(command: { status: CommandStatus; confirmationMode: ConfirmationMode }) {
  return isPendingStatus(command.status)
    && !(command.status === 'sent' && command.confirmationMode === 'not_reported');
}

export function stopSupersedes(stop: FarmCommandRequest['type'], pending: FarmCommandRequest['type']) {
  if (!isStopCommand(stop) || isStopCommand(pending)) return false;
  if (stop === 'farm.allOff') return true;
  return actuatorFor(stop) === actuatorFor(pending);
}

export function sameCommandRequest(a: FarmCommandRequest, b: FarmCommandRequest) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return JSON.stringify(a, keys) === JSON.stringify(b, keys);
}
