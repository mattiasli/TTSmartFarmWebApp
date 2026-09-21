import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { FastifyRequest } from 'fastify';
import type { FarmSnapshot } from '@smartfarm/contracts';
import { RealtimeHub } from './realtime';
import type { SessionService } from './session';
import type { FarmStore } from '../db';
import { loadConfig } from '../config';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  ping = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.emit('close'); });
}

async function fixture() {
  vi.useFakeTimers();
  const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator' });
  const record = { id: 'session', userId: 'user', revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 100_000), idleExpiresAt: new Date(Date.now() + 100_000) };
  const store = {
    consumeWsTicket: vi.fn(async () => ({ sessionId: record.id, farmId: config.FARM_ID })),
    getSessionById: vi.fn(async () => record),
    getUserById: vi.fn(async () => ({ id: 'user', disabledAt: null as Date | null })),
    getMembership: vi.fn(async () => ({ role: 'operator' })),
  };
  const hub = new RealtimeHub(config, {} as SessionService, store as unknown as FarmStore,
    () => ({} as FarmSnapshot), new Set(['http://host']));
  const socket = new Socket();
  await hub.attach(socket as unknown as WebSocket,
    { headers: { origin: 'http://host' } } as FastifyRequest);
  hub.start();
  const authenticate = async () => {
    socket.emit('message', JSON.stringify({ type: 'authenticate', ticket: 'test-ticket' }));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { hub, socket, store, record, authenticate };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('active socket authorization', () => {
  it.each(['revoked', 'idle', 'disabled', 'database'] as const)('fails closed on %s at the next heartbeat', async (condition) => {
    const f = await fixture();
    await f.authenticate();
    expect(f.socket.send).toHaveBeenCalled();
    if (condition === 'revoked') f.record.revokedAt = new Date();
    if (condition === 'idle') f.record.idleExpiresAt = new Date(Date.now() + 1);
    if (condition === 'disabled') f.store.getUserById.mockResolvedValue({ id: 'user', disabledAt: new Date() });
    if (condition === 'database') f.store.getSessionById.mockRejectedValue(new Error('unavailable'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.socket.close).toHaveBeenCalledWith(4002, expect.any(String));
    const count = f.socket.send.mock.calls.length;
    f.hub.publish('snapshot', {});
    expect(f.socket.send).toHaveBeenCalledTimes(count);
    await f.hub.close();
  });

  it('does not publish while a database recheck is stalled', async () => {
    const f = await fixture();
    await f.authenticate();
    f.store.getSessionById.mockImplementation(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(20_000);
    const count = f.socket.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(f.socket.send).toHaveBeenCalledTimes(count);
    await f.hub.close();
  });

  it('rejects in-flight authentication when access is revoked before the query returns', async () => {
    const f = await fixture();
    let release!: () => void;
    f.store.getSessionById.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve(f.record);
    }));
    await f.authenticate();
    f.hub.dropUserSessions('user');
    f.store.getSessionById.mockResolvedValue(f.record);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.socket.send).not.toHaveBeenCalled();
    expect(f.socket.close).toHaveBeenCalledWith(4401, 'session_invalid');
    await f.hub.close();
  });
});
