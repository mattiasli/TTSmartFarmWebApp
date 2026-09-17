import { createHash, randomBytes } from 'node:crypto';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';

export const SESSION_COOKIE = 'smartfarm_session';

export type StoredSession = {
  tokenHash: string;
  csrf: string;
  farmId: string;
  role: 'viewer' | 'operator' | 'admin';
  username: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export class MemorySessionStore {
  private sessions = new Map<string, StoredSession>();

  createLocalOperator() {
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const session: StoredSession = {
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

  revoke(token: string | undefined) {
    if (!token) return;
    this.sessions.delete(hashToken(token));
  }
}
