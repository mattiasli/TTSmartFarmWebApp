import type { FarmCommandRequest, FarmMode, WireTelemetry } from '@smartfarm/contracts';
import { isFresh } from './freshness';

export class CommandPolicyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = 'CommandPolicyError';
    this.code = code;
    this.status = status;
  }
}

const STOP_TYPES = new Set<FarmCommandRequest['type']>(['pump.stop', 'buzzer.stop', 'farm.allOff']);

export function assertCommandPolicy(input: {
  request: FarmCommandRequest;
  mode: FarmMode;
  liveCommandsEnabled: boolean;
  livePumpEnabled: boolean;
  controllerReady: boolean;
  brokerReady: boolean;
  telemetryAgeMs: number | null;
  telemetry: WireTelemetry | null;
}): void {
  if (!input.controllerReady) {
    throw new CommandPolicyError('CONTROLLER_UNAVAILABLE', 'Farm controller is not ready.', 503);
  }
  if (input.mode === 'live' && !input.liveCommandsEnabled) {
    throw new CommandPolicyError('LIVE_COMMANDS_DISABLED', 'Live commands are disabled.');
  }
  if (!input.brokerReady && input.mode === 'live') {
    throw new CommandPolicyError('BROKER_UNAVAILABLE', 'MQTT broker is not ready.', 503);
  }

  const isStop = STOP_TYPES.has(input.request.type);
  if (!isStop && !isFresh(input.telemetryAgeMs)) {
    throw new CommandPolicyError('STALE_TELEMETRY', 'Wait for fresh farm readings before starting outputs.');
  }
  if (isStop && !input.brokerReady && input.mode === 'live') {
    throw new CommandPolicyError('BROKER_UNAVAILABLE', 'Cannot send a stop; MQTT is disconnected.', 503);
  }

  if (input.request.type === 'pump.pulse') {
    if (input.mode === 'live' && !input.livePumpEnabled) {
      throw new CommandPolicyError('LIVE_PUMP_DISABLED', 'Live pumping is disabled until hardware acceptance.');
    }
    const data = input.telemetry;
    if (!data) throw new CommandPolicyError('STALE_TELEMETRY', 'No telemetry available for a pump pulse.');
    if (data.guard !== 1) {
      throw new CommandPolicyError('GUARD_UNCONFIRMED', 'Protected watering requires firmware guard telemetry.');
    }
    if (data.pumpBlocked === 1) {
      throw new CommandPolicyError('TANK_LOW', 'Pump blocked — tank is low.');
    }
    if (data.pumpBlocked === 2) {
      throw new CommandPolicyError('GUARD_UNCONFIRMED', 'Pump blocked — no valid water sample yet.');
    }
    if (data.pump === 1) {
      throw new CommandPolicyError('PUMP_BUSY', 'Pump is already reported running.');
    }
  }
}
