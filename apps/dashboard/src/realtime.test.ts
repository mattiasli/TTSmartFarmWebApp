import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_FARM_ID, REALTIME_PROTOCOL_VERSION, type RealtimeEnvelope } from '@smartfarm/contracts';
import { connectFarmSocket, shouldAcceptEnvelope } from './realtime';
import { createRealtimeTicket } from './api';

vi.mock('./api', () => ({ createRealtimeTicket: vi.fn() }));

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

class TestSocket extends EventTarget {
  static instances: TestSocket[] = [];
  send = vi.fn();
  close = vi.fn(() => this.dispatchEvent(new Event('close')));
  constructor(readonly url: string) { super(); TestSocket.instances.push(this); }
  snapshot(sequence = 1, epoch = 'epoch-a') {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(envelope(sequence, epoch)) }));
  }
}

describe('socket recovery', () => {
  let abort: AbortController;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('WebSocket', TestSocket);
    TestSocket.instances = [];
    abort = new AbortController();
    let tickets = 0;
    vi.mocked(createRealtimeTicket).mockReset().mockImplementation(async () => ({
      ticket: `single-use-${++tickets}`, expiresAt: '', wsUrl: 'wss://example.test/ws',
    }));
  });
  afterEach(() => {
    abort.abort();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reconnects after shutdown with a new ticket and discards the old socket listeners', async () => {
    const snapshots = vi.fn();
    const status = vi.fn();
    const connected = connectFarmSocket(snapshots, status, abort.signal);
    await vi.advanceTimersByTimeAsync(0);
    const first = TestSocket.instances[0]!;
    first.dispatchEvent(new Event('open'));
    first.snapshot();
    expect(first.send).toHaveBeenCalledWith(JSON.stringify({ type: 'authenticate', ticket: 'single-use-1' }));
    first.dispatchEvent(new Event('close'));
    await vi.advanceTimersByTimeAsync(500);
    expect(status).toHaveBeenCalledWith('poll');
    expect(TestSocket.instances).toHaveLength(2);
    const second = TestSocket.instances[1]!;
    second.dispatchEvent(new Event('open'));
    second.snapshot(1, 'epoch-b');
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ type: 'authenticate', ticket: 'single-use-2' }));
    expect(status).toHaveBeenLastCalledWith('websocket');
    first.snapshot(100);
    expect(snapshots).toHaveBeenCalledTimes(2);
    abort.abort();
    await connected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(createRealtimeTicket).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abandons a silent stream and restores polling before obtaining another ticket', async () => {
    const status = vi.fn();
    const connected = connectFarmSocket(vi.fn(), status, abort.signal);
    await vi.advanceTimersByTimeAsync(0);
    TestSocket.instances[0]!.snapshot();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(status).toHaveBeenLastCalledWith('poll');
    expect(TestSocket.instances[0]!.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(createRealtimeTicket).toHaveBeenCalledTimes(2);
    abort.abort();
    await connected;
  });

  it('backs off repeated ticket failures and cancels the pending retry', async () => {
    vi.mocked(createRealtimeTicket).mockRejectedValue(new Error('temporarily unavailable'));
    const connected = connectFarmSocket(vi.fn(), vi.fn(), abort.signal);
    await vi.advanceTimersByTimeAsync(0);
    let expectedCalls = 1;
    for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(createRealtimeTicket).toHaveBeenCalledTimes(expectedCalls);
      await vi.advanceTimersByTimeAsync(1);
      expect(createRealtimeTicket).toHaveBeenCalledTimes(++expectedCalls);
    }
    abort.abort();
    await connected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(createRealtimeTicket).toHaveBeenCalledTimes(expectedCalls);
    expect(TestSocket.instances).toHaveLength(0);
  });

  it('does not open a socket when an outstanding ticket resolves after cancellation', async () => {
    let resolve!: (ticket: Awaited<ReturnType<typeof createRealtimeTicket>>) => void;
    vi.mocked(createRealtimeTicket).mockReturnValue(new Promise((done) => { resolve = done; }));
    const connected = connectFarmSocket(vi.fn(), vi.fn(), abort.signal);
    abort.abort();
    expect(vi.mocked(createRealtimeTicket).mock.calls[0]![0]!.aborted).toBe(true);
    resolve({ ticket: 'unused', expiresAt: '', wsUrl: 'wss://example.test/ws' });
    await connected;
    expect(TestSocket.instances).toHaveLength(0);
  });
});
