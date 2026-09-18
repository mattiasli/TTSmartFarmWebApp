import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { buildApp } from '../../apps/api/src/app';
import { loadConfig } from '../../apps/api/src/config';
import { LOCAL_OAUTH_COOKIE } from '../../apps/api/src/auth/cookies';
import { FarmStore, LastAdminError, sha256 } from '../../apps/api/src/db';
import { createIsolatedDatabase, databaseAvailable } from './postgres';

const available = await databaseAvailable();
if (!available) {
  throw new Error('PostgreSQL is required for P06 auth tests. Start Docker Desktop and run npm run infra:up.');
}

describe('P06 postgres auth', () => {
  let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let store: FarmStore;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    store = new FarmStore(db.pool);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  async function appWithOauth(fetchImpl?: typeof fetch) {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_ENV: 'local',
      FARM_MODE: 'simulator',
      DATABASE_URL: db.url,
      GITHUB_OAUTH_CLIENT_ID: 'client',
      GITHUB_OAUTH_CLIENT_SECRET: 'secret',
      PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5173',
    });
    const { createDeps } = await import('../../apps/api/src/app');
    const deps = await createDeps(config);
    deps.githubFetch = fetchImpl;
    return buildApp(config, deps);
  }

  it('T068 rejects PKCE/browser binding mismatch', async () => {
    const app = await appWithOauth();
    const start = await app.inject({ method: 'GET', url: '/api/auth/github/start' });
    expect(start.statusCode).toBe(302);
    const oauth = start.cookies.find((entry) => entry.name === LOCAL_OAUTH_COOKIE)?.value ?? '';
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/github/callback?code=abc&state=${state}`,
      headers: { cookie: `${LOCAL_OAUTH_COOKIE}=${state}.wrong-binding` },
    });
    expect(callback.headers.location).toContain('reason=binding');
    expect(oauth.includes('.')).toBe(true);
    await app.close();
  });

  it('T067 rejects OAuth state replay', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify({ error: 'bad_verification_code' }), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const app = await appWithOauth(fetchImpl);
    const start = await app.inject({ method: 'GET', url: '/api/auth/github/start' });
    const oauth = start.cookies.find((entry) => entry.name === LOCAL_OAUTH_COOKIE)?.value ?? '';
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const first = await app.inject({
      method: 'GET',
      url: `/api/auth/github/callback?code=abc&state=${state}`,
      headers: { cookie: `${LOCAL_OAUTH_COOKIE}=${oauth}` },
    });
    expect(first.statusCode).toBe(302);
    const second = await app.inject({
      method: 'GET',
      url: `/api/auth/github/callback?code=abc&state=${state}`,
      headers: { cookie: `${LOCAL_OAUTH_COOKIE}=${oauth}` },
    });
    expect(String(second.headers.location)).toMatch(/reason=(replay|binding)/);
    await app.close();
  });

  it('T069 denies a non-allowlisted GitHub identity', async () => {
    const fetchImpl: typeof fetch = (async (url) => {
      const href = String(url);
      if (href.includes('access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_test' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 999, login: 'stranger', name: 'Stranger' }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const app = await appWithOauth(fetchImpl);
    const start = await app.inject({ method: 'GET', url: '/api/auth/github/start' });
    const oauth = start.cookies.find((entry) => entry.name === LOCAL_OAUTH_COOKIE)?.value ?? '';
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/github/callback?code=ok&state=${state}`,
      headers: { cookie: `${LOCAL_OAUTH_COOKIE}=${oauth}` },
    });
    expect(String(callback.headers.location)).toContain('reason=not_allowlisted');
    await app.close();
  });

  it('issues and consumes a websocket ticket once', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_ENV: 'local',
      FARM_MODE: 'simulator',
      DATABASE_URL: db.url,
    });
    const { createDeps } = await import('../../apps/api/src/app');
    const app = await buildApp(config, await createDeps(config));
    const login = await app.inject({ method: 'POST', url: '/api/v1/local/login' });
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.find((entry) => entry.name === 'smartfarm_session');
    const minted = await app.inject({
      method: 'POST',
      url: '/api/v1/realtime/tickets',
      headers: {
        'content-type': 'application/json',
        cookie: `smartfarm_session=${cookie?.value}`,
        'x-csrf-token': csrf,
        origin: 'http://127.0.0.1:5173',
      },
      payload: { farmId: LOCAL_FARM_ID },
    });
    expect(minted.statusCode).toBe(200);
    const ticket = minted.json().ticket as string;
    const first = await store.consumeWsTicket(ticket, 'http://127.0.0.1:5173');
    expect(first.farmId).toBe(LOCAL_FARM_ID);
    await expect(store.consumeWsTicket(ticket, 'http://127.0.0.1:5173')).rejects.toThrow(/already used/);
    await app.close();
  });

  it('T107 refuses to remove the last admin', async () => {
    const members = await store.listFarmAccess(LOCAL_FARM_ID);
    const admins = [];
    for (const member of members) {
      if (member.role !== 'admin') continue;
      const user = await store.getUserByGithubId(member.githubId);
      if (user) admins.push(user);
    }
    expect(admins.length).toBeGreaterThan(0);
    while (admins.length > 1) {
      const extra = admins.pop();
      if (extra) await store.removeMembership(LOCAL_FARM_ID, extra.id);
    }
    await expect(store.removeMembership(LOCAL_FARM_ID, admins[0]!.id)).rejects.toBeInstanceOf(LastAdminError);
  });

  it('T109 expires idle sessions', async () => {
    const user = await store.getUserByGithubId('43301236');
    const token = 'idle-session-token';
    await store.createSession({
      userId: user!.id,
      tokenHash: sha256(token),
      csrfSecret: 'csrf',
      idleMs: 1,
      now: new Date(Date.now() - 5_000),
    });
    expect(await store.getValidSession(token)).toBeNull();
  });
});
