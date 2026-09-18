import type { FastifyReply, FastifyRequest } from 'fastify';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { isLoopbackAddress } from '@smartfarm/domain';
import type { AppConfig } from '../config';
import { randomToken, sha256, type FarmRole, type FarmStore } from '../db';
import { MemorySessionStore } from '../sessions';
import { LOCAL_SESSION_COOKIE, sessionCookieName, setSessionCookie } from './cookies';

export type RequestSession = {
  id: string | null;
  userId: string | null;
  githubId: string | null;
  tokenHash: string;
  csrf: string;
  farmId: string;
  role: FarmRole;
  username: string;
  localLogin: boolean;
};

export class SessionService {
  constructor(
    private readonly config: AppConfig,
    private readonly memory: MemorySessionStore,
    private readonly store: FarmStore | null,
  ) {}

  cookieName() {
    return sessionCookieName(this.config);
  }

  tokenFrom(request: FastifyRequest) {
    const named = request.cookies[this.cookieName()];
    if (named) return named;
    if (this.config.APP_ENV !== 'production') return request.cookies[LOCAL_SESSION_COOKIE];
    return undefined;
  }

  async get(request: FastifyRequest): Promise<RequestSession | null> {
    const token = this.tokenFrom(request);
    if (!token) return null;
    if (this.store) {
      const record = await this.store.getValidSession(token);
      if (!record) return null;
      const user = await this.store.getUserById(record.userId);
      if (!user || user.disabledAt) return null;
      const memberships = await this.store.listMembershipsForUser(user.id);
      const membership =
        memberships.find((row) => row.farmId === this.config.FARM_ID) ?? memberships[0];
      if (!membership) return null;
      if (Date.now() - record.lastSeenAt.getTime() > 60_000) {
        await this.store.touchSession(record.id);
      }
      return {
        id: record.id,
        userId: user.id,
        githubId: user.githubId,
        tokenHash: record.tokenHash,
        csrf: record.csrfSecret,
        farmId: membership.farmId,
        role: membership.role,
        username: user.username,
        localLogin: this.config.APP_ENV === 'local',
      };
    }
    const memory = this.memory.get(token);
    if (!memory) return null;
    return {
      id: memory.id,
      userId: null,
      githubId: null,
      tokenHash: memory.tokenHash,
      csrf: memory.csrf,
      farmId: memory.farmId,
      role: memory.role,
      username: memory.username,
      localLogin: true,
    };
  }

  async createLocalOperator(_request: FastifyRequest, reply: FastifyReply): Promise<RequestSession> {
    if (this.store) {
      const user = await this.store.upsertUser({
        githubId: 'local-operator',
        username: 'local-operator',
        displayName: 'Local operator',
      });
      const existing = await this.store.getMembership(this.config.FARM_ID, user.id);
      if (!existing) {
        await this.store.pool.query(
          `INSERT INTO farm_memberships (farm_id, user_id, role)
           VALUES ($1, $2, 'admin')
           ON CONFLICT (farm_id, user_id) DO NOTHING`,
          [this.config.FARM_ID, user.id],
        );
      }
      const token = randomToken(32);
      const csrf = randomToken(24);
      const record = await this.store.createSession({
        userId: user.id,
        tokenHash: sha256(token),
        csrfSecret: csrf,
      });
      setSessionCookie(reply, this.config, token);
      return {
        id: record.id,
        userId: user.id,
        githubId: user.githubId,
        tokenHash: record.tokenHash,
        csrf,
        farmId: this.config.FARM_ID,
        role: 'admin',
        username: user.username,
        localLogin: true,
      };
    }
    const created = this.memory.createLocalOperator();
    created.session.farmId = this.config.FARM_ID || LOCAL_FARM_ID;
    setSessionCookie(reply, this.config, created.token);
    return {
      id: created.session.id,
      userId: null,
      githubId: null,
      tokenHash: created.session.tokenHash,
      csrf: created.session.csrf,
      farmId: created.session.farmId,
      role: created.session.role,
      username: created.session.username,
      localLogin: true,
    };
  }

  async createGithubSession(input: {
    githubId: string;
    username: string;
    displayName: string | null;
    farmId: string;
    role: FarmRole;
    reply: FastifyReply;
  }): Promise<RequestSession> {
    if (!this.store) throw new Error('GitHub login requires PostgreSQL.');
    const user = await this.store.upsertUser({
      githubId: input.githubId,
      username: input.username,
      displayName: input.displayName,
    });
    if (user.disabledAt) throw new Error('This account is disabled.');
    const membership = await this.store.getMembership(input.farmId, user.id);
    if (!membership) {
      await this.store.pool.query(
        `INSERT INTO farm_memberships (farm_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (farm_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [input.farmId, user.id, input.role],
      );
    }
    const token = randomToken(32);
    const csrf = randomToken(24);
    const record = await this.store.createSession({
      userId: user.id,
      tokenHash: sha256(token),
      csrfSecret: csrf,
    });
    setSessionCookie(input.reply, this.config, token);
    return {
      id: record.id,
      userId: user.id,
      githubId: user.githubId,
      tokenHash: record.tokenHash,
      csrf,
      farmId: input.farmId,
      role: membership?.role ?? input.role,
      username: user.username,
      localLogin: false,
    };
  }

  async revoke(request: FastifyRequest) {
    const token = this.tokenFrom(request);
    if (!token) return;
    this.memory.revoke(token);
    if (this.store) await this.store.revokeSession(token);
  }

  localLoginAllowed(request: FastifyRequest) {
    if (this.config.APP_ENV !== 'local' && this.config.NODE_ENV !== 'test') return false;
    return this.config.NODE_ENV === 'test' || isLoopbackAddress(request.ip);
  }
}
