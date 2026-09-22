import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { once } from 'node:events';
import { createIsolatedDatabase } from './postgres';

describe('Independent password accounts', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: Record<string, string>;
  const origin = 'http://127.0.0.1:5173';
  const customOrigin = 'https://ttsmartfarm.mattias.li';
  const farm = `/api/v1/farms/${LOCAL_FARM_ID}`;
  const password = 'isolated-test-password-123!';
  beforeAll(async () => {
    db = await createIsolatedDatabase();
    app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator',
      SIMULATOR_TRANSPORT: 'memory', DATABASE_URL: db.url, ALLOWED_BROWSER_ORIGINS: `${origin},${customOrigin}` }));
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    admin = { cookie: `smartfarm_session=${login.cookies[0]!.value}`, origin, 'x-csrf-token': login.json().csrfToken };
  });
  afterAll(async () => { await app?.close(); await db?.close(); });
  const create = (userId: string, role = 'viewer') => app.inject({ method: 'POST', url: `${farm}/accounts`,
    headers: admin, payload: { userId, password, role } });
  const login = (userId: string, pass = password, headers: Record<string,string> = { origin }) => app.inject({
    method: 'POST', url: '/api/v1/auth/password/login', headers, payload: { userId, password: pass } });
  function headers(response: Awaited<ReturnType<typeof login>>) {
    return { origin, cookie: `smartfarm_session=${response.cookies[0]!.value}`, 'x-csrf-token': response.json().csrfToken };
  }

  it('creates separate case-insensitive identities, hashes passwords and rejects duplicates atomically', async () => {
    const response = await create('Example.User');
    expect(response.statusCode).toBe(201);
    const member = response.json().members.find((m: { username: string }) => m.username === 'example.user');
    expect(member).toMatchObject({ githubId: null, loginType: 'password', role: 'viewer' });
    expect(response.body).not.toContain(password);
    expect(response.body).not.toContain('password_hash');
    const row = (await db.pool.query('SELECT password_hash FROM local_accounts WHERE login_id=$1', ['example.user'])).rows[0];
    expect(row.password_hash).toMatch(/^scrypt-32768-8-3\$/);
    expect(row.password_hash).not.toContain(password);
    const count = (await db.pool.query('SELECT count(*) FROM users')).rows[0].count;
    expect((await create('EXAMPLE.USER')).statusCode).toBe(409);
    expect((await db.pool.query('SELECT count(*) FROM users')).rows[0].count).toBe(count);
    const signedIn = await login(' EXAMPLE.USER ');
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json()).toMatchObject({ authenticated: true, role: 'viewer', username: 'example.user', localLogin: false });
    expect(signedIn.cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('rejects cross-origin login, invalid credentials and malformed account creation', async () => {
    expect((await login('example.user', password, { origin: 'https://attacker.invalid' })).statusCode).toBe(403);
    expect((await login('example.user', password, {})).statusCode).toBe(403);
    expect((await login('example.user', password, { origin: 'null' })).statusCode).toBe(403);
    expect((await login('example.user', password, { origin: `${customOrigin}.attacker.invalid` })).statusCode).toBe(403);
    const customLogin = await login('example.user', password, { origin: customOrigin });
    expect(customLogin.statusCode).toBe(200);
    expect(customLogin.json()).toMatchObject({ authenticated: true, githubLoginUrl: `${origin}/api/auth/github/start` });
    const customHeaders = { ...headers(customLogin), origin: customOrigin };
    const ticket = await app.inject({ method: 'POST', url: '/api/v1/realtime/tickets', headers: customHeaders, payload: { farmId: LOCAL_FARM_ID } });
    expect(ticket.statusCode).toBe(200);
    const wrong = await login('example.user', 'this-is-the-wrong-password');
    const absent = await login('missing.user', password);
    expect(wrong.statusCode).toBe(401);
    expect(absent.json().error.message).toBe(wrong.json().error.message);
    expect((await create('bad user')).statusCode).toBe(400);
    expect((await create('bad-role', 'owner')).statusCode).toBe(400);
    const weak = await app.inject({ method: 'POST', url: `${farm}/accounts`, headers: admin,
      payload: { userId: 'weak.user', password: 'short', role: 'admin' } });
    expect(weak.statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `${farm}/accounts`, headers: { ...admin, 'x-csrf-token': 'wrong' },
      payload: { userId: 'csrf.user', password, role: 'admin' } })).statusCode).toBe(403);
  });

  it('enforces viewer/operator roles and allows a password admin to create users', async () => {
    for (const role of ['viewer', 'operator', 'admin']) {
      expect((await create(`role.${role}`, role)).statusCode).toBe(201);
      const auth = headers(await login(`role.${role}`));
      const snapshot = await app.inject({ url: `${farm}/snapshot`, headers: auth });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().permissions.canControl).toBe(role !== 'viewer');
      const response = await app.inject({ method: 'POST', url: `${farm}/accounts`, headers: auth,
        payload: { userId: `added.by.${role}`, password, role: 'viewer' } });
      expect(response.statusCode).toBe(role === 'admin' ? 201 : 403);
      if (role === 'viewer') {
        const command = await app.inject({ method: 'POST', url: `${farm}/commands`, headers: { ...auth, 'idempotency-key': randomUUID() },
          payload: { type: 'led.set', on: true } });
        expect(command.statusCode).toBe(403);
      }
    }
  });

  it('reset, role changes and removal invalidate sessions and tickets; removed IDs can be reused', async () => {
    const created = await create('reset.user', 'operator');
    const id = created.json().members.find((m: { username: string }) => m.username === 'reset.user').userId;
    const old = headers(await login('reset.user'));
    const reset = await app.inject({ method: 'POST', url: `${farm}/accounts/${id}/password`, headers: admin,
      payload: { password: 'replacement-test-password-123!' } });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/session', headers: old })).json().authenticated).toBe(false);
    expect((await login('reset.user')).statusCode).toBe(401);
    const next = headers(await login('reset.user', 'replacement-test-password-123!'));
    const ticket = await app.inject({ method: 'POST', url: '/api/v1/realtime/tickets', headers: next, payload: { farmId: LOCAL_FARM_ID } });
    expect(ticket.statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `${farm}/accounts/${id}`, headers: admin, payload: { role: 'viewer' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/session', headers: next })).json().authenticated).toBe(false);
    const socket = await app.injectWS('/ws', { headers: { origin } });
    try {
      const closed = once(socket, 'close');
      socket.send(JSON.stringify({ type: 'authenticate', ticket: ticket.json().ticket }));
      expect((await closed)[0]).toBe(4401);
    } finally { socket.terminate(); }
    expect((await login('reset.user', 'replacement-test-password-123!')).json().role).toBe('viewer');
    expect((await app.inject({ method: 'DELETE', url: `${farm}/accounts/${id}`, headers: admin })).statusCode).toBe(200);
    expect((await login('reset.user', 'replacement-test-password-123!')).statusCode).toBe(401);
    expect((await create('reset.user')).statusCode).toBe(201);
  });

  it('does not remove the last administrator, regardless of sign-in provider', async () => {
    const members = (await app.inject({ url: `${farm}/members`, headers: admin })).json().members;
    const localAdmin = members.find((m: { username: string }) => m.username === 'role.admin');
    const localHeaders = headers(await login('role.admin'));
    for (const member of members.filter((m: { userId: string; role: string }) => m.role === 'admin' && m.userId !== localAdmin.userId)) {
      expect((await app.inject({ method: 'DELETE', url: `${farm}/accounts/${member.userId}`, headers: localHeaders })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'PUT', url: `${farm}/accounts/${localAdmin.userId}`, headers: localHeaders, payload: { role: 'viewer' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `${farm}/accounts/${localAdmin.userId}`, headers: localHeaders })).statusCode).toBe(409);
  });

  it('persists login throttling in PostgreSQL across fresh app instances', async () => {
    await db.pool.query('DELETE FROM password_login_limits');
    for (let i = 0; i < 10; i++) expect((await login('unknown.limit', password)).statusCode).toBe(401);
    const last = await login('unknown.limit', password);
    expect(last.statusCode).toBe(429);
    await app.close();
    app = await buildApp(loadConfig({ NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator', SIMULATOR_TRANSPORT: 'memory', DATABASE_URL: db.url, ALLOWED_BROWSER_ORIGINS: origin }));
    expect((await login('unknown.limit', password)).statusCode).toBe(429);
    const admins = await db.pool.query(`SELECT u.username FROM farm_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.farm_id=$1 AND m.role='admin'`, [LOCAL_FARM_ID]);
    expect(admins.rows.map((r) => r.username)).toEqual(['role.admin']);
  });
});
