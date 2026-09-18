import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../config';

export const LOCAL_SESSION_COOKIE = 'smartfarm_session';
export const HOST_SESSION_COOKIE = '__Host-smartfarm_session';
export const LOCAL_OAUTH_COOKIE = 'smartfarm_oauth';
export const HOST_OAUTH_COOKIE = '__Host-smartfarm_oauth';

export function sessionCookieName(config: AppConfig) {
  return config.APP_ENV === 'production' ? HOST_SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

export function oauthCookieName(config: AppConfig) {
  return config.APP_ENV === 'production' ? HOST_OAUTH_COOKIE : LOCAL_OAUTH_COOKIE;
}

export function cookieOptions(config: AppConfig) {
  const secure = config.APP_ENV !== 'local';
  return {
    path: '/' as const,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    signed: false,
  };
}

export function setSessionCookie(reply: FastifyReply, config: AppConfig, token: string) {
  reply.setCookie(sessionCookieName(config), token, {
    ...cookieOptions(config),
    maxAge: 12 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(sessionCookieName(config), { path: '/' });
  if (config.APP_ENV !== 'production') {
    reply.clearCookie(HOST_SESSION_COOKIE, { path: '/' });
  }
}

export function setOauthCookie(reply: FastifyReply, config: AppConfig, value: string) {
  reply.setCookie(oauthCookieName(config), value, {
    ...cookieOptions(config),
    maxAge: 10 * 60,
  });
}

export function clearOauthCookie(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(oauthCookieName(config), { path: '/' });
}
