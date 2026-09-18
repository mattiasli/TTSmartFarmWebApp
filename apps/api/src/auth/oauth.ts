import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config';
import { AuthRecordExpiredError, type FarmStore } from '../db';
import { clearOauthCookie, oauthCookieName, setOauthCookie } from './cookies';
import { exchangeGithubCode, githubAuthorizeUrl, pkceChallenge, randomUrlToken } from './pkce';
import type { SessionService } from './session';

export const OAUTH_DENIED_PATH = '/access-denied';

function callbackUrl(config: AppConfig) {
  return `${config.PUBLIC_APP_ORIGIN}/api/auth/github/callback`;
}

function parseOauthCookie(value: string | undefined) {
  if (!value) return null;
  const at = value.indexOf('.');
  if (at <= 0) return null;
  return { state: value.slice(0, at), binding: value.slice(at + 1) };
}

function deniedRedirect(config: AppConfig, reason: string) {
  const url = new URL(OAUTH_DENIED_PATH, config.PUBLIC_APP_ORIGIN);
  url.searchParams.set('reason', reason);
  return url.toString();
}

export function registerGithubOAuth(
  app: FastifyInstance,
  config: AppConfig,
  sessions: SessionService,
  store: FarmStore | null,
  fetchImpl: typeof fetch = fetch,
) {
  app.get('/api/auth/github/start', async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    if (!config.GITHUB_OAUTH_CLIENT_ID) {
      return reply.status(503).send({
        error: {
          code: 'OAUTH_UNAVAILABLE',
          message: 'GitHub login is not configured in this environment.',
          requestId: crypto.randomUUID(),
        },
      });
    }
    if (!store) {
      return reply.status(503).send({
        error: {
          code: 'OAUTH_UNAVAILABLE',
          message: 'GitHub login requires PostgreSQL.',
          requestId: crypto.randomUUID(),
        },
      });
    }
    const state = randomUrlToken(24);
    const binding = randomUrlToken(24);
    const verifier = randomUrlToken(32);
    await store.createOauthFlow({
      state,
      browserBinding: binding,
      pkceVerifier: verifier,
      environment: config.APP_ENV,
    });
    setOauthCookie(reply, config, `${state}.${binding}`);
    return reply.redirect(
      githubAuthorizeUrl({
        clientId: config.GITHUB_OAUTH_CLIENT_ID,
        redirectUri: callbackUrl(config),
        state,
        challenge: pkceChallenge(verifier),
      }),
    );
  });

  app.get('/api/auth/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store');
    const query = request.query as { code?: string; state?: string; error?: string };
    const cookie = parseOauthCookie(request.cookies[oauthCookieName(config)]);
    clearOauthCookie(reply, config);
    if (query.error) return reply.redirect(deniedRedirect(config, 'github_denied'));
    if (!store || !config.GITHUB_OAUTH_CLIENT_ID || !config.GITHUB_OAUTH_CLIENT_SECRET) {
      return reply.redirect(deniedRedirect(config, 'oauth_unconfigured'));
    }
    if (!query.code || !query.state || !cookie) {
      return reply.redirect(deniedRedirect(config, 'invalid_callback'));
    }
    if (query.state !== cookie.state) {
      return reply.redirect(deniedRedirect(config, 'state_mismatch'));
    }
    try {
      const flow = await store.consumeOauthFlow({
        state: query.state,
        browserBinding: cookie.binding,
      });
      const identity = await exchangeGithubCode({
        clientId: config.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: config.GITHUB_OAUTH_CLIENT_SECRET,
        code: query.code,
        redirectUri: callbackUrl(config),
        verifier: flow.pkceVerifier,
        fetchImpl,
      });
      const allow = await store.getAllowlist(identity.id);
      if (!allow || allow.farmId !== config.FARM_ID) {
        return reply.redirect(deniedRedirect(config, 'not_allowlisted'));
      }
      const existing = await store.getUserByGithubId(identity.id);
      if (existing?.disabledAt) {
        return reply.redirect(deniedRedirect(config, 'disabled'));
      }
      await sessions.createGithubSession({
        githubId: identity.id,
        username: identity.login,
        displayName: identity.name,
        farmId: allow.farmId,
        role: allow.role,
        reply,
      });
      return reply.redirect(`${config.PUBLIC_APP_ORIGIN}/`);
    } catch (error) {
      if (error instanceof AuthRecordExpiredError) {
        return reply.redirect(deniedRedirect(config, error.message.includes('binding') ? 'binding' : 'replay'));
      }
      return reply.redirect(deniedRedirect(config, 'oauth_failed'));
    }
  });
}
