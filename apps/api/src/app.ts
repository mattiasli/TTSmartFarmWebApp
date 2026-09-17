import cookie from '@fastify/cookie';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { LOCAL_FARM_ID, farmCommandRequestSchema, type SessionDto } from '@smartfarm/contracts';
import { CommandPolicyError, isLoopbackAddress } from '@smartfarm/domain';
import { loadConfig, redactedConfig, type AppConfig } from './config';
import { FarmController } from './controller';
import { createFarmLink } from './farm-link';
import { MemorySessionStore, SESSION_COOKIE } from './sessions';

function requestId() {
  return crypto.randomUUID();
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  id: string,
) {
  return reply.status(status).send({ error: { code, message, requestId: id } });
}

export type AppDeps = {
  controller: FarmController;
  sessions: MemorySessionStore;
};

export async function createDeps(config: AppConfig): Promise<AppDeps> {
  const link = createFarmLink(config.SIMULATOR_TRANSPORT, config.SIMULATOR_MQTT_URL);
  return {
    controller: new FarmController(config, link),
    sessions: new MemorySessionStore(),
  };
}

export async function buildApp(config: AppConfig = loadConfig(), deps?: AppDeps) {
  const resolved = deps ?? (await createDeps(config));
  const { controller, sessions } = resolved;
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'warn',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'HIVEMQ_PASSWORD'],
    },
  });
  await app.register(cookie);

  app.addHook('onClose', async () => {
    await controller.close();
  });

  const origins = new Set(
    config.ALLOWED_BROWSER_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

  function currentSession(request: FastifyRequest) {
    return sessions.get(request.cookies[SESSION_COOKIE]);
  }

  function requireLocalLoopback(request: FastifyRequest, reply: FastifyReply, id: string) {
    if (config.APP_ENV !== 'local' && config.NODE_ENV !== 'test') {
      void sendError(reply, 404, 'NOT_FOUND', 'Not found.', id);
      return false;
    }
    if (!isLoopbackAddress(request.ip) && config.NODE_ENV !== 'test') {
      void sendError(reply, 403, 'FORBIDDEN', 'Local login is loopback-only.', id);
      return false;
    }
    return true;
  }

  function requireOrigin(request: FastifyRequest, reply: FastifyReply, id: string) {
    if (config.NODE_ENV === 'test') return true;
    const origin = request.headers.origin;
    if (!origin || !origins.has(origin)) {
      void sendError(reply, 403, 'BAD_ORIGIN', 'Request origin is not allowed.', id);
      return false;
    }
    return true;
  }

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({
    status: 'ready',
    controller: 'running',
    ...redactedConfig(config),
  }));

  app.get('/api/v1/session', async (request) => {
    const session = currentSession(request);
    const body: SessionDto = session
      ? {
          authenticated: true,
          localLogin: config.APP_ENV === 'local',
          csrfToken: session.csrf,
          farmId: session.farmId,
          role: session.role,
        }
      : {
          authenticated: false,
          localLogin: config.APP_ENV === 'local',
          csrfToken: null,
          farmId: null,
          role: null,
        };
    return body;
  });

  app.post('/api/v1/local/login', async (request, reply) => {
    const id = requestId();
    if (!requireLocalLoopback(request, reply, id)) return;
    if (!requireOrigin(request, reply, id)) return;
    const created = sessions.createLocalOperator();
    reply.setCookie(SESSION_COOKIE, created.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
    const body: SessionDto = {
      authenticated: true,
      localLogin: true,
      csrfToken: created.session.csrf,
      farmId: created.session.farmId,
      role: created.session.role,
    };
    return body;
  });

  app.post('/api/v1/logout', async (request, reply) => {
    sessions.revoke(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/farms', async (request, reply) => {
    const id = requestId();
    const session = currentSession(request);
    if (!session) return sendError(reply, 401, 'UNAUTHENTICATED', 'Sign in required.', id);
    return {
      farms: [{ id: config.FARM_ID, name: config.FARM_NAME, role: session.role }],
    };
  });

  app.get('/api/v1/farms/:farmId/snapshot', async (request, reply) => {
    const id = requestId();
    const session = currentSession(request);
    if (!session) return sendError(reply, 401, 'UNAUTHENTICATED', 'Sign in required.', id);
    const { farmId } = request.params as { farmId: string };
    if (farmId !== config.FARM_ID && farmId !== LOCAL_FARM_ID) {
      return sendError(reply, 404, 'NOT_FOUND', 'Farm not found.', id);
    }
    return controller.snapshot();
  });

  app.post('/api/v1/farms/:farmId/commands', async (request, reply) => {
    const id = requestId();
    const session = currentSession(request);
    if (!session) return sendError(reply, 401, 'UNAUTHENTICATED', 'Sign in required.', id);
    if (!requireOrigin(request, reply, id)) return;
    const csrf = request.headers['x-csrf-token'];
    if (csrf !== session.csrf) return sendError(reply, 403, 'CSRF', 'CSRF token mismatch.', id);
    if (session.role === 'viewer') return sendError(reply, 403, 'FORBIDDEN', 'Viewers cannot send commands.', id);
    const { farmId } = request.params as { farmId: string };
    if (farmId !== config.FARM_ID) return sendError(reply, 404, 'NOT_FOUND', 'Farm not found.', id);
    try {
      const parsed = farmCommandRequestSchema.parse(request.body);
      const idempotencyKey =
        typeof request.headers['idempotency-key'] === 'string'
          ? request.headers['idempotency-key']
          : crypto.randomUUID();
      const command = await controller.command(parsed, idempotencyKey);
      return reply.status(202).send(command);
    } catch (error) {
      if (error instanceof CommandPolicyError) {
        return sendError(reply, error.status, error.code, error.message, id);
      }
      if (error instanceof ZodError) {
        return sendError(reply, 400, 'VALIDATION', error.issues[0]?.message ?? 'Invalid command.', id);
      }
      throw error;
    }
  });

  return app;
}
