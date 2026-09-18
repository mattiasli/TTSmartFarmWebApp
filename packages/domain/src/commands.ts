import {
  COMMAND_TOPIC_PREFIX,
  farmCommandRequestSchema,
  type FarmCommandRequest,
  type MqttCommand,
} from '@smartfarm/contracts';

const ALLOWED: Record<string, readonly string[]> = {
  fan: ['on', 'off'],
  led: ['on', 'off'],
  pump: ['on', 'off', 'pulse'],
  backlight: ['on', 'off'],
  feeder: ['open', 'close'],
  all: ['off'],
};

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

export function validateMqttCommand(control: string, payload: string): MqttCommand {
  if (typeof payload !== 'string') throw new CommandValidationError('Invalid command.');
  if (control === 'pumpguard') {
    if (!/^\d{1,2},\d{1,3}$/.test(payload)) {
      throw new CommandValidationError('Invalid pump protection limits.');
    }
    const [lowRaw, recoverRaw] = payload.split(',');
    const low = Number(lowRaw);
    const recover = Number(recoverRaw);
    if (low < 1 || low > 90 || recover <= low || recover > 100) {
      throw new CommandValidationError('Invalid pump protection limits.');
    }
  } else if (control === 'lcd') {
    const lines = payload.split('|');
    if (
      payload !== 'status' &&
      (lines.length !== 2 ||
        !lines.every((line) => line.length <= 16 && !/[^\x20-\x7b\x7d-\x7e]/.test(line)))
    ) {
      throw new CommandValidationError(
        'Use two LCD lines of up to 16 plain ASCII characters; no | character.',
      );
    }
  } else if (control === 'buzzer') {
    if (
      !['on', 'off'].includes(payload) &&
      !(/^[0-9]+$/.test(payload) && Number(payload) >= 40 && Number(payload) <= 10_000)
    ) {
      throw new CommandValidationError('Invalid buzzer frequency.');
    }
  } else if (!Object.hasOwn(ALLOWED, control) || !ALLOWED[control]?.includes(payload)) {
    throw new CommandValidationError('Unknown control or command.');
  }
  return { control, topic: `${COMMAND_TOPIC_PREFIX}${control}`, payload };
}

export function mapFarmCommand(request: FarmCommandRequest): MqttCommand {
  const parsed = farmCommandRequestSchema.parse(request);
  switch (parsed.type) {
    case 'fan.set':
      return validateMqttCommand('fan', parsed.on ? 'on' : 'off');
    case 'light.set':
      return validateMqttCommand('led', parsed.on ? 'on' : 'off');
    case 'pump.pulse':
      return validateMqttCommand('pump', 'pulse');
    case 'pump.stop':
      return validateMqttCommand('pump', 'off');
    case 'buzzer.beep':
      return validateMqttCommand('buzzer', String(parsed.frequencyHz));
    case 'buzzer.stop':
      return validateMqttCommand('buzzer', 'off');
    case 'feeder.set':
      return validateMqttCommand('feeder', parsed.open ? 'open' : 'close');
    case 'lcd.setText':
      return validateMqttCommand('lcd', `${parsed.line1}|${parsed.line2}`);
    case 'lcd.showStatus':
      return validateMqttCommand('lcd', 'status');
    case 'lcd.setBacklight':
      return validateMqttCommand('backlight', parsed.on ? 'on' : 'off');
    case 'farm.allOff':
      return validateMqttCommand('all', 'off');
  }
}

export function encodeLcdText(line1: string, line2: string): string {
  return validateMqttCommand('lcd', `${line1}|${line2}`).payload;
}

export function requestFromControl(control: string, payload: string): FarmCommandRequest {
  validateMqttCommand(control, payload);
  switch (control) {
    case 'fan':
      return { type: 'fan.set', on: payload === 'on' };
    case 'led':
      return { type: 'light.set', on: payload === 'on' };
    case 'pump':
      return payload === 'pulse' ? { type: 'pump.pulse' } : { type: 'pump.stop' };
    case 'buzzer':
      return payload === 'off'
        ? { type: 'buzzer.stop' }
        : { type: 'buzzer.beep', frequencyHz: Number(payload) };
    case 'lcd':
      if (payload === 'status') return { type: 'lcd.showStatus' };
      {
        const [line1 = '', line2 = ''] = payload.split('|');
        return { type: 'lcd.setText', line1, line2 };
      }
    case 'backlight':
      return { type: 'lcd.setBacklight', on: payload === 'on' };
    case 'all':
      return { type: 'farm.allOff' };
    default:
      throw new CommandValidationError('Unknown control or command.');
  }
}
