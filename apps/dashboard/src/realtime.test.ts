import { describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID, REALTIME_PROTOCOL_VERSION, type RealtimeEnvelope } from '@smartfarm/contracts';
import { shouldAcceptEnvelope } from './realtime';

function envelope(sequence: number, serverEpoch = 'epoch-a'): RealtimeEnvelope {
  return {
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    farmId: LOCAL_FARM_ID,
    serverEpoch,
    sequence,
    sentAt: new Date().toISOString(),
    type: 'snapshot',
    data: {},
  };
}

describe('shouldAcceptEnvelope', () => {
  it('accepts a new server epoch even with a lower sequence', () => {
    expect(shouldAcceptEnvelope({ epoch: 'epoch-a', sequence: 12 }, envelope(1, 'epoch-b'))).toBe(true);
  });

  it('rejects an older sequence on the current epoch', () => {
    expect(shouldAcceptEnvelope({ epoch: 'epoch-a', sequence: 12 }, envelope(11, 'epoch-a'))).toBe(false);
  });

  it('accepts equal or newer sequences on the current epoch', () => {
    expect(shouldAcceptEnvelope({ epoch: 'epoch-a', sequence: 12 }, envelope(12, 'epoch-a'))).toBe(true);
    expect(shouldAcceptEnvelope({ epoch: 'epoch-a', sequence: 12 }, envelope(13, 'epoch-a'))).toBe(true);
  });
});
