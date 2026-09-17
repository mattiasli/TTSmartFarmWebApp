import { describe, expect, it } from 'vitest';
import { assertLoopbackMqttUrl } from './loopback';

describe('assertLoopbackMqttUrl', () => {
  it('accepts a loopback MQTT URL', () => {
    expect(assertLoopbackMqttUrl('mqtt://127.0.0.1:1883').hostname).toBe('127.0.0.1');
  });

  it('rejects the production HiveMQ hostname', () => {
    expect(() =>
      assertLoopbackMqttUrl('mqtt://f17c61d465c44169817197fe13b014df.s1.eu.hivemq.cloud:8883'),
    ).toThrow(/loopback|HiveMQ/i);
  });
});
