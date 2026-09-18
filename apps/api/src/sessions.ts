import { createHash, randomBytes } from 'node:crypto';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';

export const SESSION_COOKIE = 'smartfarm_session';

export type StoredSession = {
  id: string;
  tokenHash: string;
  csrf: string;
  farmId: string;
  role: 'viewer' | 'operator' | 'admin';
  username: string;
};

type MemoryTicket = {
  sessionId: string;
  farmId: string;
  origin: string;
  expiresAt: number;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export class MemorySessionStore {
  private sessions = new Map<string, StoredSession>();
  private tickets = new Map<string, MemoryTicket>();

  createLocalOperator() {
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const session: StoredSession = {
      id: crypto.randomUUID(),
      tokenHash,
      csrf,
      farmId: LOCAL_FARM_ID,
      role: 'admin',
      username: 'local-operator',
    };
    this.sessions.set(tokenHash, session);
    return { token, session };
  }

  get(token: string | undefined): StoredSession | undefined {
    if (!token) return undefined;
    return this.sessions.get(hashToken(token));
  }

  getById(id: string): StoredSession | undefined {
    for (const session of this.sessions.values()) if (session.id === id) return session;
    return undefined;
  }

  createTicket(session: StoredSession, origin: string, ttlMs = 30_000) {
    const raw = randomBytes(32).toString('hex');
    this.tickets.set(hashToken(raw), {
      sessionId: session.id,
      farmId: session.farmId,
      origin,
      expiresAt: Date.now() + ttlMs,
    });
    return { raw, expiresAt: new Date(Date.now() + ttlMs) };
  }

  consumeTicket(raw: string, origin: string) {
    const key = hashToken(raw);
    const ticket = this.tickets.get(key);
    this.tickets.delete(key);
    if (!ticket || ticket.expiresAt <= Date.now() || ticket.origin !== origin) return null;
    return ticket;
  }

  revoke(token: string | undefined) {
    if (!token) return;
    this.sessions.delete(hashToken(token));
  }
}
