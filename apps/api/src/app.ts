import cookie from '@fastify/cookie';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import pg from 'pg';
import { ZodError } from 'zod';
import {
  HISTORY_SERIES,
  LOCAL_FARM_ID,
  RULE_IDS,
  automationSettingsSchema,
  farmCommandRequestSchema,
  type FarmSnapshot,
  type HistorySeries,
  type RuleId,
  type SessionDto,
} from '@smartfarm/contracts';
import { CommandPolicyError, SCENARIO_NAMES, type ScenarioName } from '@smartfarm/domain';
import { registerGithubOAuth } from './auth/oauth';
import { RealtimeHub, registerRealtime } from './auth/realtime';
import { clearSessionCookie } from './auth/cookies';
import { SessionService, type RequestSession } from './auth/session';
import { loadConfig, redactedConfig, type AppConfig } from './config';
import { FarmController } from './controller';
import {
  DedicatedControllerLock,
  FarmStore,
  IdempotencyConflictError,
  LastAdminError,
  QueryWindowError,
  RevisionConflictError,
  createPool,
  seedLocal,
  type FarmRole,
} from './db';
import { createConfiguredFarmLink, MemoryFarmLink } from './farm-link';
import { MemorySessionStore } from './sessions';
import { DatabaseMaintenance } from './db/maintenance';

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
  memorySessions: MemorySessionStore;
  store: FarmStore | null;
  pool: pg.Pool | null;
  githubFetch?: typeof fetch;
};

export async function createDeps(config: AppConfig): Promise<AppDeps> {
  const link = createConfiguredFarmLink(config);
  if (!config.DATABASE_URL) {
    return {
      controller: new FarmController(config, link),
      memorySessions: new MemorySessionStore(),
      store: null,
      pool: null,
    };
  }
  const pool = createPool(config.DATABASE_URL);
  const store = new FarmStore(pool);
  await seedLocal(pool, { farmId: config.FARM_ID, farmName: config.FARM_NAME, environment: config.APP_ENV });
  const saved = await store.getConfig(config.FARM_ID);
  const runtime = await store.getRuntime(config.FARM_ID);
  const lockKey = await store.getFarmLockKey(config.FARM_ID);
  const lock = new DedicatedControllerLock(config.DATABASE_URL, lockKey);
  const controller = new FarmController(config, link, () => Date.now(), store, {
    settings: saved?.settings,
    revision: saved?.revision,
    lock,
    runtime: runtime
      ? {
          attempts: runtime.attempts,
          cooldownUntilMs: runtime.cooldownUntil?.getTime() ?? null,
          lastPumpStopMs: runtime.lastPumpStopAt?.getTime() ?? null,
          manual: runtime.manualOverrides,
        }
      : undefined,
  });
  await controller.becomeOwner();
  return {
    controller,
    memorySessions: new MemorySessionStore(),
    store,
    pool,
  };
}

export async function buildApp(config: AppConfig = loadConfig(), deps?: AppDeps) {
  const resolved = deps ?? (await createDeps(config));
  const { controller, memorySessions, store } = resolved;
  const sessions = new SessionService(config, memorySessions, store);
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'warn',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'HIVEMQ_PASSWORD',
        'GITHUB_OAUTH_CLIENT_SECRET',
      ],
    },
  });
  await app.register(cookie);

  // Isolate maintenance load and bound database waits during shutdown/outages.
  const maintenancePool = store && config.DATABASE_URL ? new pg.Pool({
    connectionString: config.DATABASE_URL, max: 1, connectionTimeoutMillis: 2000,
    statement_timeout: 1000, query_timeout: 2000, idleTimeoutMillis: 5000,
  }) : null;
  maintenancePool?.on('error', () => app.log.warn({ event: 'maintenance_connection_lost' }, 'Database maintenance connection lost'));
  const maintenance = maintenancePool ? new DatabaseMaintenance(new FarmStore(maintenancePool),
    (event) => app.log.info(event, 'Database maintenance')) : null;
  app.addHook('onReady', async () => { maintenance?.start(); });

  const origins = new Set(
    config.ALLOWED_BROWSER_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const hub = new RealtimeHub(
    config,
    sessions,
    store,
    () => controller.snapshot(),
    origins,
    memorySessions,
  );
  hub.start();

  app.addHook('preClose', async () => {
    await Promise.all([controller.drain(), maintenance?.close()]);
  });

  app.addHook('onClose', async () => {
    await hub.close();
    await controller.close();
    await maintenance?.close();
    await maintenancePool?.end();
    await resolved.pool?.end();
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    if (String(reply.getHeader('cache-control') ?? '') === '') {
      reply.header('cache-control', 'private, no-store');
    }
    return payload;
  });

  function sessionDto(session: RequestSession | null): SessionDto {
    return session
      ? {
          authenticated: true,
          localLogin: session.localLogin,
          csrfToken: session.csrf,
          farmId: session.farmId,
          role: session.role,
          username: session.username,
          githubLoginEnabled: Boolean(config.GITHUB_OAUTH_CLIENT_ID && store),
        }
      : {
          authenticated: false,
          localLogin: config.APP_ENV === 'local',
          csrfToken: null,
          farmId: null,
          role: null,
          username: null,
          githubLoginEnabled: Boolean(config.GITHUB_OAUTH_CLIENT_ID && store),
        };
  }

  function withPermissions(snapshot: FarmSnapshot, session: RequestSession): FarmSnapshot {
    return {
      ...snapshot,
      permissions: {
        canView: true,
        canControl: snapshot.permissions.canControl && session.role !== 'viewer',
        canPump: Boolean(snapshot.permissions.canPump) && snapshot.permissions.canControl && session.role !== 'viewer',
      },
    };
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

  async function currentSession(request: FastifyRequest) {
    return sessions.get(request);
  }

  async function requireSession(request: FastifyRequest, reply: FastifyReply, id: string) {
    const session = await currentSession(request);
    if (!session) {
      void sendError(reply, 401, 'UNAUTHENTICATED', 'Sign in required.', id);
      return null;
    }
    return session;
  }

  async function requireFarm(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
    farmId: string,
    mutate = false,
  ) {
    const session = await requireSession(request, reply, id);
    if (!session) return null;
    if (farmId !== config.FARM_ID && farmId !== LOCAL_FARM_ID) {
      void sendError(reply, 404, 'NOT_FOUND', 'Farm not found.', id);
      return null;
    }
    if (session.farmId !== config.FARM_ID && farmId !== session.farmId) {
      void sendError(reply, 404, 'NOT_FOUND', 'Farm not found.', id);
      return null;
    }
    if (mutate) {
      if (!requireOrigin(request, reply, id)) return null;
      if (request.headers['x-csrf-token'] !== session.csrf) {
        void sendError(reply, 403, 'CSRF', 'CSRF token mismatch.', id);
        return null;
      }
    }
    return session;
  }

  async function requireRole(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
    farmId: string,
    min: FarmRole,
  ) {
    const session = await requireFarm(request, reply, id, farmId, true);
    if (!session) return null;
    const rank = { viewer: 0, operator: 1, admin: 2 };
    if (rank[session.role] < rank[min]) {
      void sendError(reply, 403, 'FORBIDDEN', 'Insufficient role.', id);
      return null;
    }
    return session;
  }

  app.get('/health/live', async () => ({ status: 'ok' }));
  let lastReadyOwnership: string | undefined;
  app.get('/health/ready', async () => {
    // The new process can serve HTTP while it waits for the old owner's drain.
    // Log only the initial observation and transitions, without configuration secrets.
    if (lastReadyOwnership !== controller.ownership) {
      app.log.info({ event: 'readiness_ownership', releaseSha: config.RELEASE_SHA,
        controller: controller.ownership, httpReady: true }, 'API readiness ownership observed');
      lastReadyOwnership = controller.ownership;
    }
    return {
      status: 'ready',
      serverTime: new Date().toISOString(),
      controller: controller.ownership,
      ...redactedConfig(config),
    };
  });

  app.get('/api/v1/diagnostics', async (request, reply) => {
    const id = requestId();
    const session = await requireSession(request, reply, id);
    if (!session) return;
    return controller.diagnostics();
  });

  app.get<{ Params: { farmId: string } }>('/api/v1/farms/:farmId/diagnostics/database', async (request, reply) => {
    const id = requestId();
    const session = await requireFarm(request, reply, id, request.params.farmId);
    if (!session) return;
    if (session.role !== 'admin') return sendError(reply, 403, 'FORBIDDEN', 'Admin role required.', id);
    if (!store) return sendError(reply, 503, 'UNAVAILABLE', 'Persistent database is not configured.', id);
    return { ...(await store.databaseStatus(request.params.farmId)), maintenance: maintenance?.status() ?? null };
  });

  registerGithubOAuth(app, config, sessions, store, resolved.githubFetch);
  await registerRealtime(app, hub, sessions, store, config, origins, memorySessions);

  app.get('/api/v1/session', async (request) => sessionDto(await currentSession(request)));

  app.post('/api/v1/local/login', async (request, reply) => {
    const id = requestId();
    if (config.APP_ENV === 'production' || (config.NODE_ENV !== 'test' && config.APP_ENV !== 'local')) {
      return sendError(reply, 404, 'NOT_FOUND', 'Not found.', id);
    }
    if (!sessions.localLoginAllowed(request)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Local login is loopback-only.', id);
    }
    if (!requireOrigin(request, reply, id)) return;
    const created = await sessions.createLocalOperator(request, reply);
    return sessionDto(created);
  });

  app.post('/api/v1/logout', async (request, reply) => {
    const session = await currentSession(request);
    await sessions.revoke(request);
    if (session?.id) hub.dropSession(session.id);
    clearSessionCookie(reply, config);
    return { ok: true };
  });

  app.get('/api/v1/farms', async (request, reply) => {
    const id = requestId();
    const session = await requireSession(request, reply, id);
    if (!session) return;
    return {
      farms: [{ id: config.FARM_ID, name: config.FARM_NAME, role: session.role }],
    };
  });

  app.get('/api/v1/farms/:farmId/snapshot', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireFarm(request, reply, id, farmId);
    if (!session) return;
    return withPermissions(controller.snapshot(), session);
  });

  // Environmental fixtures are available only on the memory simulator. Never
  // register this route in production, even with NODE_ENV=test or simulator mode.
  if (config.APP_ENV !== 'production' && config.FARM_MODE === 'simulator'
    && config.SIMULATOR_TRANSPORT === 'memory' && !config.LIVE_COMMANDS_ENABLED
    && !config.LIVE_PUMP_ENABLED && controller.link instanceof MemoryFarmLink) {
    const simulator = controller.link;
    app.post('/api/v1/farms/:farmId/simulator/scenario', async (request, reply) => {
      const id = requestId();
      const { farmId } = request.params as { farmId: string };
      const session = await requireRole(request, reply, id, farmId, 'admin');
      if (!session) return;
      if (controller.ownership !== 'owner') {
        return sendError(reply, 503, 'UNAVAILABLE', 'Simulator controller is not the active owner.', id);
      }
      const body = request.body as { scenario?: unknown };
      if (typeof body?.scenario !== 'string' || body.scenario === 'legacy'
        || (body.scenario !== 'telemetry-stall' && !SCENARIO_NAMES.includes(body.scenario as ScenarioName))) {
        return sendError(reply, 400, 'VALIDATION', 'Choose a supported environmental simulator scenario.', id);
      }
      if (body.scenario === 'telemetry-stall') simulator.silenceTelemetry();
      else simulator.setScenario(body.scenario as ScenarioName);
      const next = withPermissions(controller.snapshot(), session);
      hub.publish('snapshot', next, farmId);
      return next;
    });
  }

  app.get('/api/v1/farms/:farmId/commands/:commandId', async (request, reply) => {
    const id = requestId();
    const { farmId, commandId } = request.params as { farmId: string; commandId: string };
    const session = await requireFarm(request, reply, id, farmId);
    if (!session) return;
    const current = controller.getCommand(commandId) ?? (store ? await store.getCommand(commandId) : null);
    if (!current) return sendError(reply, 404, 'NOT_FOUND', 'Command not found.', id);
    return current;
  });

  app.post('/api/v1/farms/:farmId/commands', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    try {
      const parsed = farmCommandRequestSchema.parse(request.body);
      const idempotencyKey =
        typeof request.headers['idempotency-key'] === 'string'
          ? request.headers['idempotency-key']
          : crypto.randomUUID();
      const actor = session.userId ? `user:${session.userId}` : `user:${session.username}`;
      const command = await controller.command(parsed, idempotencyKey, actor);
      hub.publish('command', command, farmId);
      hub.publish('snapshot', withPermissions(controller.snapshot(), session), farmId);
      return reply.status(202).send(command);
    } catch (error) {
      if (error instanceof CommandPolicyError) {
        return sendError(reply, error.status, error.code, error.message, id);
      }
      if (error instanceof IdempotencyConflictError) {
        return sendError(reply, 409, error.code, error.message, id);
      }
      if (error instanceof ZodError) {
        return sendError(reply, 400, 'VALIDATION', error.issues[0]?.message ?? 'Invalid command.', id);
      }
      throw error;
    }
  });

  app.post('/api/v1/farms/:farmId/automations/start', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    try {
      const next = withPermissions(controller.startAutomations(), session);
      hub.publish('automation', next.automations, farmId);
      hub.publish('snapshot', next, farmId);
      return next;
    } catch (error) {
      return sendError(reply, 422, 'AUTOMATION', error instanceof Error ? error.message : 'Cannot start.', id);
    }
  });

  app.post('/api/v1/farms/:farmId/automations/pause', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    const next = withPermissions(controller.pauseAutomations(), session);
    hub.publish('automation', next.automations, farmId);
    hub.publish('snapshot', next, farmId);
    return next;
  });

  app.post('/api/v1/farms/:farmId/automations/resume-rule', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    const body = request.body as { rule?: string };
    if (!body?.rule || !RULE_IDS.includes(body.rule as RuleId)) {
      return sendError(reply, 400, 'VALIDATION', 'Unknown automation.', id);
    }
    controller.resumeRule(body.rule as RuleId);
    const next = withPermissions(controller.snapshot(), session);
    hub.publish('snapshot', next, farmId);
    return next;
  });

  app.post('/api/v1/farms/:farmId/automations/reset-watering', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    try {
      const next = withPermissions(controller.resetWatering(), session);
      hub.publish('snapshot', next, farmId);
      return next;
    } catch (error) {
      return sendError(reply, 422, 'AUTOMATION', error instanceof Error ? error.message : 'Cannot reset.', id);
    }
  });

  app.put('/api/v1/farms/:farmId/automations/settings', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    try {
      const settings = automationSettingsSchema.parse(request.body);
      const match = request.headers['if-match'];
      const expected = typeof match === 'string' && match !== '' ? Number(match) : undefined;
      const next = withPermissions(await controller.configure(settings, expected), session);
      hub.publish('snapshot', next, farmId);
      return next;
    } catch (error) {
      if (error instanceof ZodError) {
        return sendError(reply, 400, 'VALIDATION', error.issues[0]?.message ?? 'Invalid settings.', id);
      }
      if (error instanceof RevisionConflictError || (error as Error & { code?: string }).code === 'REVISION') {
        return sendError(reply, 409, 'REVISION', error instanceof Error ? error.message : 'Revision conflict.', id);
      }
      throw error;
    }
  });

  app.post('/api/v1/farms/:farmId/automations/sync-guard', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireRole(request, reply, id, farmId, 'operator');
    if (!session) return;
    const next = withPermissions(controller.syncGuard(), session);
    hub.publish('snapshot', next, farmId);
    return next;
  });

  app.get('/api/v1/farms/:farmId/members', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireFarm(request, reply, id, farmId);
    if (!session) return;
    if (session.role !== 'admin') return sendError(reply, 403, 'FORBIDDEN', 'Insufficient role.', id);
    if (!store) return { members: [] };
    return { members: await store.listFarmAccess(farmId) };
  });

  app.put('/api/v1/farms/:farmId/members/:githubId', async (request, reply) => {
    const id = requestId();
    const { farmId, githubId } = request.params as { farmId: string; githubId: string };
    const session = await requireRole(request, reply, id, farmId, 'admin');
    if (!session) return;
    if (!store) return sendError(reply, 503, 'UNAVAILABLE', 'Membership changes require PostgreSQL.', id);
    const body = request.body as { role?: FarmRole };
    if (!body?.role || !['viewer', 'operator', 'admin'].includes(body.role)) {
      return sendError(reply, 400, 'VALIDATION', 'Role must be viewer, operator, or admin.', id);
    }
    try {
      const user = await store.getUserByGithubId(githubId)
        ?? await store.upsertUser({ githubId, username: githubId });
      const previous = await store.getMembership(farmId, user.id);
      await store.setMembership({ farmId, userId: user.id, role: body.role });
      if (previous?.role !== body.role) {
        await store.revokeUserSessions(user.id);
        hub.dropUserSessions(user.id);
      }
      await store.upsertAllowlist({
        githubId,
        farmId,
        role: body.role,
        createdBy: session.username,
      });
      return { members: await store.listFarmAccess(farmId) };
    } catch (error) {
      if (error instanceof LastAdminError) return sendError(reply, 409, error.code, error.message, id);
      throw error;
    }
  });

  app.delete('/api/v1/farms/:farmId/members/:githubId', async (request, reply) => {
    const id = requestId();
    const { farmId, githubId } = request.params as { farmId: string; githubId: string };
    const session = await requireRole(request, reply, id, farmId, 'admin');
    if (!session) return;
    if (!store) return sendError(reply, 503, 'UNAVAILABLE', 'Membership changes require PostgreSQL.', id);
    const user = await store.getUserByGithubId(githubId);
    if (!user) return sendError(reply, 404, 'NOT_FOUND', 'Member not found.', id);
    try {
      await store.removeMembership(farmId, user.id);
      await store.revokeAllowlist(githubId);
      await store.revokeUserSessions(user.id);
      hub.dropUserSessions(user.id);
      return { members: await store.listFarmAccess(farmId) };
    } catch (error) {
      if (error instanceof LastAdminError) return sendError(reply, 409, error.code, error.message, id);
      throw error;
    }
  });

  app.get('/api/v1/farms/:farmId/history', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireFarm(request, reply, id, farmId);
    if (!session) return;
    const query = request.query as { from?: string; to?: string; path?: string; bucketSeconds?: string };
    const path = query.path ?? 't';
    if (!HISTORY_SERIES.includes(path as HistorySeries)) {
      return sendError(reply, 400, 'VALIDATION', 'Unsupported history series.', id);
    }
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return sendError(reply, 400, 'VALIDATION', 'Invalid history range.', id);
    }
    if (!store) {
      return { path, from: from.toISOString(), to: to.toISOString(), points: [] };
    }
    try {
      const points = await store.queryHistory({
        farmId,
        from,
        to,
        path,
        bucketSeconds: query.bucketSeconds ? Number(query.bucketSeconds) : undefined,
      });
      return {
        path,
        from: from.toISOString(),
        to: to.toISOString(),
        points: points.map((point) => ({
          bucket: point.bucket.toISOString(),
          min: point.min,
          max: point.max,
          avg: point.avg,
          count: point.count,
        })),
      };
    } catch (error) {
      if (error instanceof QueryWindowError) return sendError(reply, 400, error.code, error.message, id);
      throw error;
    }
  });

  app.get('/api/v1/farms/:farmId/events', async (request, reply) => {
    const id = requestId();
    const { farmId } = request.params as { farmId: string };
    const session = await requireFarm(request, reply, id, farmId);
    if (!session) return;
    const query = request.query as { cursor?: string; limit?: string; category?: string };
    if (!store) {
      const pending = controller.snapshot().pendingCommands.map((command) => ({
        id: command.id,
        category: `command.${command.status}`,
        severity: 'info' as const,
        details: { action: command.action, reason: command.reason },
        createdAt: command.requestedAt,
        commandId: command.id,
      }));
      return { events: pending, nextCursor: null };
    }
    let cursor: { createdAt: string; id: string } | null = null;
    if (query.cursor) {
      try {
        cursor = JSON.parse(query.cursor) as { createdAt: string; id: string };
      } catch {
        return sendError(reply, 400, 'VALIDATION', 'Invalid event cursor.', id);
      }
    }
    const page = await store.listEvents({
      farmId,
      limit: query.limit ? Number(query.limit) : 50,
      cursor,
      category: query.category,
    });
    return {
      events: page.events.map((event) => ({
        id: event.id,
        category: event.category,
        severity: event.severity,
        details: event.details,
        createdAt: event.createdAt.toISOString(),
        commandId: event.commandId,
      })),
      nextCursor: page.nextCursor,
    };
  });

  return app;
}
