import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config';
import { FarmStore, randomToken, sha256, type FarmRole } from '../db';
import { withTransaction } from '../db/pool';
import { setSessionCookie } from './cookies';
import { hashPassword, normalizeLogin, PasswordBusyError, validPassword, verifyPassword } from './password';
import type { RequestSession } from './session';
import type { SessionDto } from '@smartfarm/contracts';
import { LastAdminError } from '../db';

type Access = (request: FastifyRequest, reply: FastifyReply, id: string, farmId: string,
  role: FarmRole) => Promise<RequestSession | null>;
const roles = new Set(['viewer', 'operator', 'admin']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function registerLocalAccounts(app: FastifyInstance, options: {
  store: FarmStore | null; config: AppConfig; requireRole: Access;
  dropUserSessions: (userId: string) => void;
  sessionDto: (session: RequestSession | null) => SessionDto;
}) {
  const { store, config, requireRole, dropUserSessions, sessionDto } = options;
  const origins = new Set(config.ALLOWED_BROWSER_ORIGINS.split(',').map((s) => s.trim()));
  function fail(reply: FastifyReply, status: number, message: string) {
    return reply.code(status).send({ error: { code: status === 429 ? 'RATE_LIMIT' : 'ACCOUNT_ERROR',
      message, requestId: randomUUID() } });
  }
  async function limited(key: string, max: number) {
    const result = await store!.query(
      `INSERT INTO password_login_limits (key_hash, attempts, expires_at)
       VALUES ($1, 1, now() + interval '15 minutes')
       ON CONFLICT (key_hash) DO UPDATE SET
         attempts = CASE WHEN password_login_limits.expires_at <= now() THEN 1 ELSE password_login_limits.attempts + 1 END,
         expires_at = CASE WHEN password_login_limits.expires_at <= now() THEN now() + interval '15 minutes' ELSE password_login_limits.expires_at END
       RETURNING attempts`, [sha256(key)]);
    return Number(result.rows[0]!.attempts) > max;
  }
  function handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof LastAdminError) return fail(reply, 409, error.message);
    if (error instanceof PasswordBusyError) return fail(reply, 429, error.message);
    if ((error as { code?: string }).code === '23505') return fail(reply, 409, 'That user ID is already in use.');
    // Never forward database errors containing bound credential values.
    app.log.error({ event: 'local_account_operation_failed' }, 'Account operation failed');
    return fail(reply, 503, 'Account service is temporarily unavailable.');
  }

  app.post('/api/v1/auth/password/login', { bodyLimit: 4096 }, async (request, reply) => {
    if (!store) return fail(reply, 503, 'Password sign-in requires the account database.');
    if (!request.headers.origin || !origins.has(request.headers.origin)) return fail(reply, 403, 'Request origin is not allowed.');
    const body = request.body as { userId?: unknown; password?: unknown } | null;
    const login = normalizeLogin(body?.userId);
    if (!login || !validPassword(body?.password)) return fail(reply, 401, 'Invalid user ID or password.');
    try {
      // A global cap also bounds storage growth and protects the controller on proxy deployments.
      if (await limited('global', 100)) return fail(reply, 429, 'Too many sign-in attempts. Try again in 15 minutes.');
      await store.query('DELETE FROM password_login_limits WHERE expires_at <= now()');
      if (await limited(`ip:${request.ip}`, 30) || await limited(`user:${login}`, 10)) {
        return fail(reply, 429, 'Too many sign-in attempts. Try again in 15 minutes.');
      }
      const result = await store.query('SELECT user_id, password_hash FROM local_accounts WHERE login_id = $1', [login]);
      const credential = result.rows[0];
      const verified = await verifyPassword(body.password, credential?.password_hash ?? null);
      if (!verified || !credential) {
        return fail(reply, 401, 'Invalid user ID or password.');
      }
      const token = randomToken(32);
      const csrf = randomToken(24);
      // Lock membership and credential through insertion: reset/removal cannot leave a new stale session.
      const created = await withTransaction(store.pool, async (client) => {
        const found = await client.query(
          `SELECT u.id, u.username, m.role FROM local_accounts a
           JOIN users u ON u.id = a.user_id JOIN farm_memberships m ON m.user_id = u.id
           WHERE a.login_id = $1 AND a.password_hash = $2 AND u.disabled_at IS NULL AND m.farm_id = $3
           FOR UPDATE OF a, m`, [login, credential.password_hash, config.FARM_ID]);
        const user = found.rows[0];
        if (!user) return null;
        const id = randomUUID();
        await client.query(`INSERT INTO sessions (id, token_hash, user_id, csrf_secret, created_at, expires_at, idle_expires_at, last_seen_at)
          VALUES ($1,$2,$3,$4,now(),now()+interval '12 hours',now()+interval '2 hours',now())`,
        [id, sha256(token), user.id, csrf]);
        await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
        return { id, userId: String(user.id), githubId: null, tokenHash: sha256(token), csrf,
          farmId: config.FARM_ID, role: user.role as FarmRole, username: String(user.username), localLogin: false };
      });
      if (!created) return fail(reply, 401, 'Invalid user ID or password.');
      setSessionCookie(reply, config, token);
      return sessionDto(created);
    } catch (error) { return handleError(error, reply); }
  });

  app.post('/api/v1/farms/:farmId/accounts', { bodyLimit: 4096 }, async (request, reply) => {
    const { farmId } = request.params as { farmId: string };
    if (!await requireRole(request, reply, randomUUID(), farmId, 'admin')) return;
    if (!store) return fail(reply, 503, 'Account changes require PostgreSQL.');
    const body = request.body as { userId?: unknown; password?: unknown; role?: FarmRole } | null;
    const login = normalizeLogin(body?.userId);
    if (!login || !validPassword(body?.password) || !roles.has(body?.role ?? '')) {
      return fail(reply, 400, 'Use a 3–64 character user ID (letters, numbers, . _ -), a 15–128 character password, and a valid role.');
    }
    try {
      const passwordHash = await hashPassword(body.password);
      await withTransaction(store.pool, async (client) => {
        const id = randomUUID();
        await client.query('INSERT INTO users (id, username) VALUES ($1,$2)', [id, login]);
        await client.query('INSERT INTO local_accounts (user_id, login_id, password_hash) VALUES ($1,$2,$3)', [id, login, passwordHash]);
        await client.query('INSERT INTO farm_memberships (farm_id,user_id,role) VALUES ($1,$2,$3)', [farmId,id,body.role]);
      });
      return reply.code(201).send({ members: await store.listFarmAccess(farmId) });
    } catch (error) { return handleError(error, reply); }
  });

  for (const method of ['PUT', 'DELETE', 'POST'] as const) {
    app.route({ method, url: `/api/v1/farms/:farmId/accounts/:userId${method === 'POST' ? '/password' : ''}`,
      bodyLimit: 4096, handler: async (request, reply) => {
        const { farmId, userId } = request.params as { farmId: string; userId: string };
        if (!await requireRole(request, reply, randomUUID(), farmId, 'admin')) return;
        if (!store) return fail(reply, 503, 'Account changes require PostgreSQL.');
        if (!uuid.test(userId)) return fail(reply, 404, 'Member not found.');
        try {
          const user = await store.getUserById(userId);
          if (!user || !await store.getMembership(farmId, userId)) return fail(reply, 404, 'Member not found.');
          const body = request.body as { role?: FarmRole; password?: unknown } | null;
          if (method === 'POST') {
            if (!validPassword(body?.password)) return fail(reply, 400, 'Use a password of 15–128 characters.');
            const hash = await hashPassword(body.password);
            const changed = await withTransaction(store.pool, async (client) => {
              const result = await client.query('UPDATE local_accounts SET password_hash=$2, updated_at=now() WHERE user_id=$1 RETURNING user_id', [userId,hash]);
              if (!result.rowCount) return false;
              await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
              return true;
            });
            if (!changed) return fail(reply, 400, 'This member uses GitHub sign-in.');
          } else if (method === 'PUT') {
            if (!roles.has(body?.role ?? '')) return fail(reply, 400, 'Choose viewer, operator or admin.');
            await store.setMembership({ farmId, userId, role: body!.role! });
            if (user.githubId) await store.upsertAllowlist({ githubId: user.githubId, farmId, role: body!.role! });
          } else {
            await store.removeMembership(farmId, userId);
            if (user.githubId) await store.revokeAllowlist(user.githubId);
            else await store.query(`DELETE FROM local_accounts WHERE user_id=$1
              AND NOT EXISTS (SELECT 1 FROM farm_memberships WHERE user_id=$1)`, [userId]);
          }
          await store.revokeUserSessions(userId);
          dropUserSessions(userId);
          return { members: await store.listFarmAccess(farmId) };
        } catch (error) { return handleError(error, reply); }
      } });
  }
}
