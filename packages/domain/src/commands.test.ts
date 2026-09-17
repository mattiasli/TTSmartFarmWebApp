import { describe, expect, it } from 'vitest';
import { encodeLcdText, mapFarmCommand, validateMqttCommand } from './commands';

describe('command mapping', () => {
  it('maps typed API actions onto canonical firmware topics', () => {
    expect(mapFarmCommand({ type: 'fan.set', on: true })).toEqual({
      control: 'fan',
      topic: 'smartfarm/cmd/fan',
      payload: 'on',
    });
    expect(mapFarmCommand({ type: 'pump.pulse' })).toEqual({
      control: 'pump',
      topic: 'smartfarm/cmd/pump',
      payload: 'pulse',
    });
    expect(mapFarmCommand({ type: 'feeder.set', open: false })).toEqual({
      control: 'feeder',
      topic: 'smartfarm/cmd/feeder',
      payload: 'close',
    });
    expect(mapFarmCommand({ type: 'farm.allOff' }).payload).toBe('off');
  });

  it('rejects topic injection and unknown controls', () => {
    expect(() => validateMqttCommand('../anything', 'on')).toThrow();
    expect(() => validateMqttCommand('__proto__', 'on')).toThrow();
    expect(() => validateMqttCommand('all', 'on')).toThrow();
    expect(() => validateMqttCommand('pump', '999')).toThrow();
  });

  it('encodes LCD text with firmware limits', () => {
    expect(encodeLcdText('Hello, little', 'world!')).toBe('Hello, little|world!');
    expect(encodeLcdText('1234567890123456', '1234567890123456').length).toBe(33);
    expect(encodeLcdText('', '')).toBe('|');
    expect(validateMqttCommand('lcd', 'status').payload).toBe('status');
    for (const bad of [
      ['x'.repeat(17), ''],
      ['hello', 'there|extra'],
      ['hello\n', 'world'],
      ['🌱', 'garden'],
    ] as const) {
      expect(() => encodeLcdText(bad[0], bad[1])).toThrow();
    }
  });

  it('validates pumpguard pairs', () => {
    expect(validateMqttCommand('pumpguard', '20,30').topic).toBe('smartfarm/cmd/pumpguard');
    for (const bad of ['0,30', '30,20', '20,101', '20,30,1', '20,30\n']) {
      expect(() => validateMqttCommand('pumpguard', bad)).toThrow();
    }
  });

  it('maps LCD and all-off without exposing continuous pump on', () => {
    expect(mapFarmCommand({ type: 'lcd.setText', line1: 'Hello, little', line2: 'world!' }).payload).toBe(
      'Hello, little|world!',
    );
    expect(mapFarmCommand({ type: 'lcd.showStatus' }).payload).toBe('status');
    expect(mapFarmCommand({ type: 'farm.allOff' })).toEqual({
      control: 'all',
      topic: 'smartfarm/cmd/all',
      payload: 'off',
    });
    expect(() => mapFarmCommand({ type: 'pump.pulse', on: true } as never)).toThrow();
  });
});
