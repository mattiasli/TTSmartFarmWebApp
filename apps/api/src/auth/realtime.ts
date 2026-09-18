import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  REALTIME_PROTOCOL_VERSION,
  realtimeEnvelopeSchema,
  type FarmSnapshot,
  type RealtimeEnvelope,
} from '@smartfarm/contracts';
import type { AppConfig } from '../config';
import { AuthRecordExpiredError, randomToken, type FarmStore } from '../db';
import type { SessionService } from './session';

const AUTH_TIMEOUT_MS = 5_000;
const AUTH_FRAME_MAX = 2048;
const HEARTBEAT_MS = 20_000;
const STALE_MS = 45_000;
const MAX_SOCKETS_PER_SESSION = 3;
const MAX_SOCKETS_TOTAL = 100;
const MAX_BUFFERED = 1_048_576;

type SocketClient = {
  socket: WebSocket;
  sessionId: string | null;
  farmId: string | null;
  origin: string;
  authed: boolean;
  lastSeen: number;
};

export class RealtimeHub {
  private readonly clients = new Set<SocketClient>();
  private sequence = 0;
  readonly serverEpoch = crypto.randomUUID();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
    private readonly store: FarmStore | null,
    private readonly snapshot: () => FarmSnapshot,
    private readonly origins: Set<string>,
  ) {}

  start() {
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
  }

  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const client of this.clients) {
      try {
        client.socket.close(4001, 'server_shutdown');
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }

  dropSession(sessionId: string) {
    for (const client of [...this.clients]) {
      if (client.sessionId === sessionId) this.closeClient(client, 4002, 'session_revoked');
    }
  }

  publish(type: RealtimeEnvelope['type'], data: unknown, farmId = this.config.FARM_ID) {
    const envelope: RealtimeEnvelope = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      farmId,
      serverEpoch: this.serverEpoch,
      sequence: ++this.sequence,
      sentAt: new Date().toISOString(),
      type,
      data,
    };
    const payload = JSON.stringify(envelope);
    for (const client of this.clients) {
      if (!client.authed || client.farmId !== farmId) continue;
      if (client.socket.readyState !== 1) continue;
      if (client.socket.bufferedAmount > MAX_BUFFERED) {
        this.closeClient(client, 4003, 'backpressure');
        continue;
      }
      client.socket.send(payload);
    }
  }

  private tick() {
    const now = Date.now();
    for (const client of [...this.clients]) {
      if (now - client.lastSeen > STALE_MS) {
        this.closeClient(client, 4004, 'heartbeat_timeout');
        continue;
      }
      if (client.authed && client.socket.readyState === 1) {
        try {
          client.socket.ping();
        } catch {
          this.closeClient(client, 4004, 'heartbeat_timeout');
        }
      }
    }
  }

  private closeClient(client: SocketClient, code: number, reason: string) {
    this.clients.delete(client);
    try {
      client.socket.close(code, reason);
    } catch {
      // ignore
    }
  }

  private sessionCount(sessionId: string) {
    let count = 0;
    for (const client of this.clients) if (client.sessionId === sessionId && client.authed) count += 1;
    return count;
  }

  async attach(socket: WebSocket, request: FastifyRequest) {
    const origin = request.headers.origin;
    if (!origin || !this.origins.has(origin) || this.clients.size >= MAX_SOCKETS_TOTAL) {
      socket.close(4403, 'bad_origin');
      return;
    }
    const client: SocketClient = {
      socket,
      sessionId: null,
      farmId: null,
      origin,
      authed: false,
      lastSeen: Date.now(),
    };
    this.clients.add(client);
    const timer = setTimeout(() => {
      if (!client.authed) this.closeClient(client, 4401, 'auth_timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('pong', () => {
      client.lastSeen = Date.now();
    });
    socket.on('close', () => {
      clearTimeout(timer);
      this.clients.delete(client);
    });
    socket.on('message', (raw) => {
      void this.onMessage(client, raw, timer);
    });
  }

  private async onMessage(client: SocketClient, raw: WebSocket.RawData, timer: ReturnType<typeof setTimeout>) {
    client.lastSeen = Date.now();
    const text = typeof raw === 'string' ? raw : raw.toString();
    if (!client.authed) {
      if (text.length > AUTH_FRAME_MAX) {
        this.closeClient(client, 4401, 'auth_frame');
        return;
      }
      try {
        const parsed = JSON.parse(text) as { type?: string; ticket?: string };
        if (parsed.type !== 'authenticate' || typeof parsed.ticket !== 'string') {
          this.closeClient(client, 4401, 'auth_frame');
          return;
        }
        if (!this.store) {
          this.closeClient(client, 4401, 'tickets_require_database');
          return;
        }
        const ticket = await this.store.consumeWsTicket(parsed.ticket, client.origin);
        const session = await this.store.getSessionById(ticket.sessionId);
        if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
          this.closeClient(client, 4401, 'session_invalid');
          return;
        }
        if (this.sessionCount(session.id) >= MAX_SOCKETS_PER_SESSION) {
          this.closeClient(client, 4401, 'socket_limit');
          return;
        }
        client.authed = true;
        client.sessionId = session.id;
        client.farmId = ticket.farmId;
        clearTimeout(timer);
        this.publish('snapshot', this.snapshot(), ticket.farmId);
      } catch (error) {
        this.closeClient(client, 4401, error instanceof AuthRecordExpiredError ? 'ticket' : 'auth_failed');
      }
      return;
    }
    try {
      const parsed = JSON.parse(text) as { type?: string };
      if (parsed.type === 'pong' || parsed.type === 'heartbeat') return;
    } catch {
      this.closeClient(client, 4400, 'protocol');
    }
  }
}

export async function registerRealtime(
  app: FastifyInstance,
  hub: RealtimeHub,
  sessions: SessionService,
  store: FarmStore | null,
  config: AppConfig,
  origins: Set<string>,
) {
  await app.register(websocket);
  app.get('/ws', { websocket: true }, (socket, request) => {
    void hub.attach(socket, request);
  });

  app.post('/api/v1/realtime/tickets', async (request, reply) => {
    const session = await sessions.get(request);
    if (!session) {
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in required.', requestId: crypto.randomUUID() },
      });
    }
    const headerOrigin = request.headers.origin;
    if (config.NODE_ENV !== 'test' && (!headerOrigin || !origins.has(headerOrigin))) {
      return reply.status(403).send({
        error: { code: 'BAD_ORIGIN', message: 'Request origin is not allowed.', requestId: crypto.randomUUID() },
      });
    }
    const origin = headerOrigin || config.PUBLIC_APP_ORIGIN;
    if (request.headers['x-csrf-token'] !== session.csrf) {
      return reply.status(403).send({
        error: { code: 'CSRF', message: 'CSRF token mismatch.', requestId: crypto.randomUUID() },
      });
    }
    const body = request.body as { farmId?: string };
    const farmId = body?.farmId ?? session.farmId;
    if (farmId !== session.farmId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Farm not found.', requestId: crypto.randomUUID() },
      });
    }
    if (!store || !session.id) {
      return reply.status(503).send({
        error: {
          code: 'TICKETS_UNAVAILABLE',
          message: 'Realtime tickets require PostgreSQL sessions.',
          requestId: crypto.randomUUID(),
        },
      });
    }
    const rawTicket = randomToken(32);
    const ticket = await store.createWsTicket({
      sessionId: session.id,
      farmId,
      origin,
      rawTicket,
    });
    reply.header('cache-control', 'private, no-store');
    return {
      ticket: rawTicket,
      expiresAt: ticket.expiresAt.toISOString(),
      wsUrl: config.PUBLIC_WS_URL,
    };
  });
}

export { realtimeEnvelopeSchema };
