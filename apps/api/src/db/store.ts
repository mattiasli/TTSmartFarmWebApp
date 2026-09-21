import {
  DEFAULT_AUTOMATIONS,
  automationSettingsSchema,
  type CommandStatus,
  type ConfirmationMode,
  type FarmCommandRequest,
  type RuleId,
} from '@smartfarm/contracts';
import { validateAutomations } from '@smartfarm/domain';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { requestHash, sha256 } from './crypto';
import {
  AuthRecordExpiredError,
  IdempotencyConflictError,
  LastAdminError,
  QueryWindowError,
  RevisionConflictError,
  isPgCheckViolation,
  isPgUniqueViolation,
} from './errors';
import { MAX_HISTORY_POINTS, THIRTY_DAYS_MS, assertHistoryQueryWindow } from './history-window';
import {
  mapAllowlist,
  mapCommand,
  mapConfig,
  mapEvent,
  mapMembership,
  mapOauthFlow,
  mapPreferences,
  mapRuntime,
  mapSample,
  mapSession,
  mapTicket,
  mapUser,
} from './mappers';
import { withTransaction, type Queryable } from './pool';
import type {
  AllowlistRecord,
  AutomationConfigRecord,
  AutomationRuntimeRecord,
  CommandRecord,
  EventCursor,
  EventRecord,
  FarmPreferenceRecord,
  FarmRole,
  GuardStatus,
  HistorySeriesPoint,
  MembershipRecord,
  OauthFlowRecord,
  SessionRecord,
  TelemetrySampleRecord,
  UserRecord,
  WsTicketRecord,
} from './types';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 10_000;
const EVENT_PAGE_MAX = 100;
const AUTH_SWEEP_BATCH = 500;
const RETENTION_BATCH = 1000;

function asRow(row: unknown): Record<string, unknown> {
  return row as Record<string, unknown>;
}

export function confirmationModeFor(action: FarmCommandRequest['type']): ConfirmationMode {
  if (action === 'pump.pulse') return 'pulse_observation';
  if (action === 'buzzer.beep' || action.startsWith('lcd.')) return 'not_reported';
  return 'state_match';
}

export class FarmStore {
  constructor(readonly pool: pg.Pool) {}

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params);
  }

  async upsertUser(input: {
    githubId: string;
    username: string;
    displayName?: string | null;
    id?: string;
  }): Promise<UserRecord> {
    const result = await this.pool.query(
      `INSERT INTO users (id, github_id, username, display_name, last_login_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (github_id) DO UPDATE
         SET username = EXCLUDED.username,
             display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             last_login_at = now()
       RETURNING *`,
      [input.id ?? randomUUID(), input.githubId, input.username, input.displayName ?? null],
    );
    return mapUser(asRow(result.rows[0]));
  }

  async getUserByGithubId(githubId: string): Promise<UserRecord | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE github_id = $1', [githubId]);
    return result.rows[0] ? mapUser(asRow(result.rows[0])) : null;
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] ? mapUser(asRow(result.rows[0])) : null;
  }

  async listMembershipsForUser(userId: string): Promise<MembershipRecord[]> {
    const result = await this.pool.query('SELECT * FROM farm_memberships WHERE user_id = $1', [userId]);
    return result.rows.map((row) => mapMembership(asRow(row)));
  }

  async listFarmAccess(farmId: string): Promise<
    Array<{
      githubId: string;
      username: string;
      displayName: string | null;
      role: FarmRole;
      disabledAt: Date | null;
      allowlisted: boolean;
    }>
  > {
    const result = await this.pool.query(
      `SELECT u.github_id, u.username, u.display_name, m.role, u.disabled_at,
              EXISTS (
                SELECT 1 FROM login_allowlist a
                WHERE a.github_id = u.github_id AND a.farm_id = m.farm_id AND a.revoked_at IS NULL
              ) AS allowlisted
       FROM farm_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.farm_id = $1
       ORDER BY u.username`,
      [farmId],
    );
    return result.rows.map((row) => ({
      githubId: String(row.github_id),
      username: String(row.username),
      displayName: row.display_name == null ? null : String(row.display_name),
      role: row.role as FarmRole,
      disabledAt: row.disabled_at == null ? null : new Date(String(row.disabled_at)),
      allowlisted: Boolean(row.allowlisted),
    }));
  }

  async revokeAllowlist(githubId: string, now = new Date()) {
    await this.pool.query(
      `UPDATE login_allowlist SET revoked_at = $2 WHERE github_id = $1 AND revoked_at IS NULL`,
      [githubId, now],
    );
  }

  async getSessionById(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    return result.rows[0] ? mapSession(asRow(result.rows[0])) : null;
  }

  async upsertAllowlist(input: {
    githubId: string;
    farmId: string;
    role: FarmRole;
    createdBy?: string | null;
  }): Promise<AllowlistRecord> {
    const result = await this.pool.query(
      `INSERT INTO login_allowlist (github_id, farm_id, role, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE
         SET farm_id = EXCLUDED.farm_id,
             role = EXCLUDED.role,
             revoked_at = NULL
       RETURNING *`,
      [input.githubId, input.farmId, input.role, input.createdBy ?? null],
    );
    return mapAllowlist(asRow(result.rows[0]));
  }

  async getAllowlist(githubId: string): Promise<AllowlistRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM login_allowlist WHERE github_id = $1 AND revoked_at IS NULL',
      [githubId],
    );
    return result.rows[0] ? mapAllowlist(asRow(result.rows[0])) : null;
  }

  async getMembership(farmId: string, userId: string): Promise<MembershipRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM farm_memberships WHERE farm_id = $1 AND user_id = $2',
      [farmId, userId],
    );
    return result.rows[0] ? mapMembership(asRow(result.rows[0])) : null;
  }

  async setMembership(input: {
    farmId: string;
    userId: string;
    role: FarmRole;
  }): Promise<MembershipRecord> {
    return withTransaction(this.pool, async (client) => {
      await this.assertRemainingAdmin(client, input.farmId, input.userId, input.role !== 'admin');
      const result = await client.query(
        `INSERT INTO farm_memberships (farm_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (farm_id, user_id) DO UPDATE SET role = EXCLUDED.role
         RETURNING *`,
        [input.farmId, input.userId, input.role],
      );
      return mapMembership(asRow(result.rows[0]));
    });
  }

  async removeMembership(farmId: string, userId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.assertRemainingAdmin(client, farmId, userId, true);
      await client.query('DELETE FROM farm_memberships WHERE farm_id = $1 AND user_id = $2', [
        farmId,
        userId,
      ]);
    });
  }

  private async assertRemainingAdmin(
    client: pg.PoolClient,
    farmId: string,
    userId: string,
    removingAdminSeat: boolean,
  ) {
    if (!removingAdminSeat) return;
    const result = await client.query<{ user_id: string }>(
      `SELECT m.user_id
       FROM farm_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.farm_id = $1 AND m.role = 'admin' AND u.disabled_at IS NULL
       FOR UPDATE OF m`,
      [farmId],
    );
    const remaining = result.rows.filter((row) => row.user_id !== userId);
    if (remaining.length < 1) {
      throw new LastAdminError();
    }
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    csrfSecret: string;
    absoluteMs?: number;
    idleMs?: number;
    now?: Date;
  }): Promise<SessionRecord> {
    const now = input.now ?? new Date();
    const absoluteMs = input.absoluteMs ?? 12 * 60 * 60 * 1000;
    const idleMs = input.idleMs ?? 2 * 60 * 60 * 1000;
    const result = await this.pool.query(
      `INSERT INTO sessions (
         id, token_hash, user_id, csrf_secret, created_at, expires_at, idle_expires_at, last_seen_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $5)
       RETURNING *`,
      [
        randomUUID(),
        input.tokenHash,
        input.userId,
        input.csrfSecret,
        now,
        new Date(now.getTime() + absoluteMs),
        new Date(now.getTime() + idleMs),
      ],
    );
    return mapSession(asRow(result.rows[0]));
  }

  async getValidSession(token: string, now = new Date()): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > $2
         AND idle_expires_at > $2`,
      [sha256(token), now],
    );
    return result.rows[0] ? mapSession(asRow(result.rows[0])) : null;
  }

  async touchSession(sessionId: string, idleMs = 2 * 60 * 60 * 1000, now = new Date()) {
    await this.pool.query(
      `UPDATE sessions
       SET last_seen_at = $2, idle_expires_at = $3
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, now, new Date(now.getTime() + idleMs)],
    );
  }

  async revokeSession(token: string, now = new Date()) {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = $2
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [sha256(token), now],
    );
  }

  async revokeUserSessions(userId: string, now = new Date()) {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, now],
    );
  }

  async createOauthFlow(input: {
    state: string;
    browserBinding: string;
    pkceVerifier: string;
    environment: string;
    ttlMs?: number;
    now?: Date;
  }): Promise<OauthFlowRecord> {
    const now = input.now ?? new Date();
    const result = await this.pool.query(
      `INSERT INTO oauth_flows (
         id, state_hash, browser_binding_hash, pkce_verifier, environment, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        randomUUID(),
        sha256(input.state),
        sha256(input.browserBinding),
        input.pkceVerifier,
        input.environment,
        now,
        new Date(now.getTime() + (input.ttlMs ?? 10 * 60 * 1000)),
      ],
    );
    return mapOauthFlow(asRow(result.rows[0]));
  }

  async consumeOauthFlow(input: {
    state: string;
    browserBinding: string;
    now?: Date;
  }): Promise<OauthFlowRecord> {
    const now = input.now ?? new Date();
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `SELECT * FROM oauth_flows WHERE state_hash = $1 FOR UPDATE`,
        [sha256(input.state)],
      );
      const row = result.rows[0];
      if (!row) throw new AuthRecordExpiredError('Unknown OAuth state.');
      const flow = mapOauthFlow(asRow(row));
      if (flow.consumedAt) throw new AuthRecordExpiredError('OAuth state was already used.');
      if (flow.expiresAt.getTime() <= now.getTime()) {
        throw new AuthRecordExpiredError('OAuth state expired.');
      }
      if (flow.browserBindingHash !== sha256(input.browserBinding)) {
        throw new AuthRecordExpiredError('OAuth browser binding mismatch.');
      }
      const updated = await client.query(
        `UPDATE oauth_flows SET consumed_at = $2 WHERE id = $1 RETURNING *`,
        [flow.id, now],
      );
      return mapOauthFlow(asRow(updated.rows[0]));
    });
  }

  async createWsTicket(input: {
    sessionId: string;
    farmId: string;
    origin: string;
    rawTicket: string;
    ttlMs?: number;
    now?: Date;
  }): Promise<WsTicketRecord> {
    const now = input.now ?? new Date();
    const result = await this.pool.query(
      `INSERT INTO ws_tickets (
         id, ticket_hash, session_id, farm_id, origin, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        randomUUID(),
        sha256(input.rawTicket),
        input.sessionId,
        input.farmId,
        input.origin,
        now,
        new Date(now.getTime() + (input.ttlMs ?? 30_000)),
      ],
    );
    return mapTicket(asRow(result.rows[0]));
  }

  async consumeWsTicket(rawTicket: string, origin: string, now = new Date()): Promise<WsTicketRecord> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(`SELECT * FROM ws_tickets WHERE ticket_hash = $1 FOR UPDATE`, [
        sha256(rawTicket),
      ]);
      const row = result.rows[0];
      if (!row) throw new AuthRecordExpiredError('Unknown websocket ticket.');
      const ticket = mapTicket(asRow(row));
      if (ticket.consumedAt) throw new AuthRecordExpiredError('Websocket ticket was already used.');
      if (ticket.expiresAt.getTime() <= now.getTime()) {
        throw new AuthRecordExpiredError('Websocket ticket expired.');
      }
      if (ticket.origin !== origin) throw new AuthRecordExpiredError('Websocket ticket origin mismatch.');
      const updated = await client.query(
        `UPDATE ws_tickets SET consumed_at = $2 WHERE id = $1 RETURNING *`,
        [ticket.id, now],
      );
      return mapTicket(asRow(updated.rows[0]));
    });
  }

  async getConfig(farmId: string): Promise<AutomationConfigRecord | null> {
    const result = await this.pool.query('SELECT * FROM automation_configs WHERE farm_id = $1', [farmId]);
    return result.rows[0] ? mapConfig(asRow(result.rows[0])) : null;
  }

  async saveConfig(input: {
    farmId: string;
    settings: unknown;
    expectedRevision: number;
    editorUserId?: string | null;
  }): Promise<AutomationConfigRecord> {
    const settings = validateAutomations(input.settings);
    return withTransaction(this.pool, async (client) => {
      const current = await client.query('SELECT * FROM automation_configs WHERE farm_id = $1 FOR UPDATE', [
        input.farmId,
      ]);
      const row = current.rows[0];
      if (!row) {
        if (input.expectedRevision !== 0) throw new RevisionConflictError();
        const inserted = await client.query(
          `INSERT INTO automation_configs (farm_id, revision, settings, editor_user_id, schema_version)
           VALUES ($1, 1, $2, $3, 1)
           RETURNING *`,
          [input.farmId, settings, input.editorUserId ?? null],
        );
        await this.insertEvent(client, {
          farmId: input.farmId,
          category: 'automation.config',
          severity: 'info',
          details: { revision: 1 },
          actorScope: input.editorUserId ? `user:${input.editorUserId}` : null,
        });
        return mapConfig(asRow(inserted.rows[0]));
      }
      const currentRevision = Number(row.revision);
      if (currentRevision !== input.expectedRevision) {
        throw new RevisionConflictError();
      }
      const nextRevision = currentRevision + 1;
      const updated = await client.query(
        `UPDATE automation_configs
         SET revision = $2, settings = $3, editor_user_id = $4, updated_at = now()
         WHERE farm_id = $1
         RETURNING *`,
        [input.farmId, nextRevision, settings, input.editorUserId ?? null],
      );
      await this.insertEvent(client, {
        farmId: input.farmId,
        category: 'automation.config',
        severity: 'info',
        details: { revision: nextRevision },
        actorScope: input.editorUserId ? `user:${input.editorUserId}` : null,
      });
      return mapConfig(asRow(updated.rows[0]));
    });
  }

  async getRuntime(farmId: string): Promise<AutomationRuntimeRecord | null> {
    const result = await this.pool.query('SELECT * FROM automation_runtime WHERE farm_id = $1', [farmId]);
    return result.rows[0] ? mapRuntime(asRow(result.rows[0])) : null;
  }

  async saveRuntime(input: {
    farmId: string;
    pausedReason: string;
    masterEnabled: boolean;
    manualOverrides?: RuleId[];
    attempts?: number;
    lastPumpStopAt?: Date | null;
    cooldownUntil?: Date | null;
    guardTarget?: { tankLow: number; tankRecover: number } | null;
    guardStatus?: GuardStatus;
  }): Promise<AutomationRuntimeRecord> {
    const result = await this.pool.query(
      `INSERT INTO automation_runtime (
         farm_id, runtime_revision, paused_reason, master_enabled, manual_overrides, attempts,
         last_pump_stop_at, cooldown_until, guard_target, guard_status
       ) VALUES ($1, 1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (farm_id) DO UPDATE SET
         runtime_revision = automation_runtime.runtime_revision + 1,
         paused_reason = EXCLUDED.paused_reason,
         master_enabled = EXCLUDED.master_enabled,
         manual_overrides = EXCLUDED.manual_overrides,
         attempts = EXCLUDED.attempts,
         last_pump_stop_at = EXCLUDED.last_pump_stop_at,
         cooldown_until = EXCLUDED.cooldown_until,
         guard_target = EXCLUDED.guard_target,
         guard_status = EXCLUDED.guard_status,
         updated_at = now()
       RETURNING *`,
      [
        input.farmId,
        input.pausedReason,
        input.masterEnabled,
        JSON.stringify(input.manualOverrides ?? []),
        input.attempts ?? 0,
        input.lastPumpStopAt ?? null,
        input.cooldownUntil ?? null,
        input.guardTarget ? JSON.stringify(input.guardTarget) : null,
        input.guardStatus ?? 'unknown',
      ],
    );
    return mapRuntime(asRow(result.rows[0]));
  }

  async savePreferences(input: {
    farmId: string;
    lcdLine1: string;
    lcdLine2: string;
    lcdMode: 'status' | 'custom';
    changedBy?: string | null;
  }): Promise<FarmPreferenceRecord> {
    const result = await this.pool.query(
      `INSERT INTO farm_preferences (farm_id, lcd_line1, lcd_line2, lcd_mode, changed_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (farm_id) DO UPDATE SET
         lcd_line1 = EXCLUDED.lcd_line1,
         lcd_line2 = EXCLUDED.lcd_line2,
         lcd_mode = EXCLUDED.lcd_mode,
         changed_by = EXCLUDED.changed_by,
         updated_at = now()
       RETURNING *`,
      [input.farmId, input.lcdLine1, input.lcdLine2, input.lcdMode, input.changedBy ?? null],
    );
    return mapPreferences(asRow(result.rows[0]));
  }

  async reserveCommand(input: {
    farmId: string;
    actorScope: string;
    source?: CommandRecord['source'];
    idempotencyKey: string;
    request: FarmCommandRequest;
    connectionEpoch?: string | null;
    receiveSequence?: number | null;
    now?: Date;
  }): Promise<{ command: CommandRecord; dispatched: boolean }> {
    const payload = input.request;
    const hash = requestHash(payload);
    const now = input.now ?? new Date();
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query(
          `SELECT * FROM commands
           WHERE farm_id = $1 AND actor_scope = $2 AND idempotency_key = $3
           FOR UPDATE`,
          [input.farmId, input.actorScope, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const command = mapCommand(asRow(existing.rows[0]));
          if (command.requestHash !== hash) throw new IdempotencyConflictError();
          return { command, dispatched: false };
        }
        const inserted = await client.query(
          `INSERT INTO commands (
             id, farm_id, actor_scope, source, idempotency_key, request_hash, action, payload,
             status, confirmation_mode, requested_at, connection_epoch, receive_sequence
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'accepted',$9,$10,$11,$12)
           RETURNING *`,
          [
            randomUUID(),
            input.farmId,
            input.actorScope,
            input.source ?? 'user',
            input.idempotencyKey,
            hash,
            payload.type,
            payload,
            confirmationModeFor(payload.type),
            now,
            input.connectionEpoch ?? null,
            input.receiveSequence ?? null,
          ],
        );
        const command = mapCommand(asRow(inserted.rows[0]));
        await this.insertEvent(client, {
          farmId: input.farmId,
          category: 'command.accepted',
          severity: 'info',
          details: { action: payload.type },
          actorScope: input.actorScope,
          commandId: command.id,
        });
        return { command, dispatched: true };
      });
    } catch (error) {
      if (!isPgUniqueViolation(error)) throw error;
      const again = await this.pool.query(
        `SELECT * FROM commands
         WHERE farm_id = $1 AND actor_scope = $2 AND idempotency_key = $3`,
        [input.farmId, input.actorScope, input.idempotencyKey],
      );
      if (!again.rows[0]) throw error;
      const command = mapCommand(asRow(again.rows[0]));
      if (command.requestHash !== hash) throw new IdempotencyConflictError();
      return { command, dispatched: false };
    }
  }

  async updateCommandStatus(input: {
    id: string;
    status: CommandStatus;
    sentAt?: Date | null;
    stateMatchedAt?: Date | null;
    reason?: string | null;
    supersededBy?: string | null;
  }): Promise<CommandRecord | null> {
    const result = await this.pool.query(
      `UPDATE commands SET
         status = $2,
         sent_at = COALESCE($3, sent_at),
         state_matched_at = COALESCE($4, state_matched_at),
         reason = COALESCE($5, reason),
         superseded_by = COALESCE($6, superseded_by)
       WHERE id = $1
       RETURNING *`,
      [
        input.id,
        input.status,
        input.sentAt ?? null,
        input.stateMatchedAt ?? null,
        input.reason ?? null,
        input.supersededBy ?? null,
      ],
    );
    return result.rows[0] ? mapCommand(asRow(result.rows[0])) : null;
  }

  async getCommand(id: string): Promise<CommandRecord | null> {
    const result = await this.pool.query('SELECT * FROM commands WHERE id = $1', [id]);
    return result.rows[0] ? mapCommand(asRow(result.rows[0])) : null;
  }

  async listPendingCommands(farmId: string): Promise<CommandRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM commands
       WHERE farm_id = $1 AND status IN ('accepted', 'publishing', 'sent')
         AND NOT (status = 'sent' AND confirmation_mode = 'not_reported')
       ORDER BY requested_at ASC`,
      [farmId],
    );
    return result.rows.map((row) => mapCommand(asRow(row)));
  }

  async recordEvent(input: {
    farmId: string;
    category: string;
    severity: EventRecord['severity'];
    details?: Record<string, unknown>;
    actorScope?: string | null;
    commandId?: string | null;
    serverEpoch?: string | null;
    serverSequence?: number | string | null;
  }): Promise<EventRecord> {
    return this.insertEvent(this.pool, input);
  }

  private async insertEvent(
    db: Queryable,
    input: {
      farmId: string;
      category: string;
      severity: EventRecord['severity'];
      details?: Record<string, unknown>;
      actorScope?: string | null;
      commandId?: string | null;
      serverEpoch?: string | null;
      serverSequence?: number | string | null;
    },
  ): Promise<EventRecord> {
    const result = await db.query(
      `INSERT INTO events (
         id, farm_id, category, severity, details, actor_scope, command_id, server_epoch, server_sequence
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(),
        input.farmId,
        input.category,
        input.severity,
        JSON.stringify(input.details ?? {}),
        input.actorScope ?? null,
        input.commandId ?? null,
        input.serverEpoch ?? null,
        input.serverSequence ?? null,
      ],
    );
    return mapEvent(asRow(result.rows[0]));
  }

  async listEvents(input: {
    farmId: string;
    limit?: number;
    cursor?: EventCursor | null;
    category?: string;
  }): Promise<{ events: EventRecord[]; nextCursor: EventCursor | null }> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), EVENT_PAGE_MAX);
    const params: unknown[] = [input.farmId];
    let where = 'farm_id = $1';
    if (input.category) {
      params.push(input.category);
      where += ` AND category = $${params.length}`;
    }
    if (input.cursor) {
      params.push(input.cursor.createdAt, input.cursor.id);
      where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit + 1);
    const result = await this.pool.query(
      `SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
       FROM events WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows.map((row) => mapEvent(asRow(row)));
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const last = events[events.length - 1];
    return {
      events,
      // PostgreSQL microseconds must survive the cursor; JS Date truncates them.
      nextCursor: hasMore && last ? {
        createdAt: String(result.rows[events.length - 1]!.cursor_created_at), id: last.id,
      } : null,
    };
  }

  async recordTelemetrySample(
    farmId: string,
    payload: Record<string, unknown>,
    sampledAt = new Date(),
  ): Promise<TelemetrySampleRecord | null> {
    const bucket = new Date(Math.floor(sampledAt.getTime() / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS);
    const result = await this.pool.query(
      `INSERT INTO telemetry_samples (farm_id, sampled_at, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (farm_id, sampled_at) DO NOTHING
       RETURNING *`,
      [farmId, bucket, JSON.stringify(payload)],
    );
    return result.rows[0] ? mapSample(asRow(result.rows[0])) : null;
  }

  async queryHistory(input: {
    farmId: string;
    from: Date;
    to: Date;
    path: string;
    bucketSeconds?: number;
  }): Promise<HistorySeriesPoint[]> {
    const { bucketSeconds } = assertHistoryQueryWindow(
      input.from,
      input.to,
      input.bucketSeconds ?? 60,
    );
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(input.path)) {
      throw new QueryWindowError('Unsupported history series.');
    }
    const result = await this.pool.query(
      `SELECT
         to_timestamp(floor(extract(epoch FROM sampled_at) / $4) * $4) AS bucket,
         min((payload ->> $3)::double precision) FILTER (WHERE payload ? $3) AS min,
         max((payload ->> $3)::double precision) FILTER (WHERE payload ? $3) AS max,
         avg((payload ->> $3)::double precision) FILTER (WHERE payload ? $3) AS avg,
         count(*) FILTER (WHERE payload ? $3) AS count
       FROM telemetry_samples
       WHERE farm_id = $1 AND sampled_at >= $2 AND sampled_at < $5
       GROUP BY 1
       ORDER BY 1 ASC
       LIMIT ${MAX_HISTORY_POINTS}`,
      [input.farmId, input.from, input.path, bucketSeconds, input.to],
    );
    return result.rows.map((row) => ({
      bucket: row.bucket instanceof Date ? row.bucket : new Date(String(row.bucket)),
      min: row.min == null ? null : Number(row.min),
      max: row.max == null ? null : Number(row.max),
      avg: row.avg == null ? null : Number(row.avg),
      count: Number(row.count),
    }));
  }

  async sweepExpiredAuth(now = new Date()): Promise<{ oauth: number; tickets: number; sessions: number }> {
    const oauth = await this.pool.query(
      `DELETE FROM oauth_flows
       WHERE id IN (
         SELECT id FROM oauth_flows
         WHERE expires_at < $1 OR consumed_at IS NOT NULL AND consumed_at < $1 - interval '1 hour'
         LIMIT ${AUTH_SWEEP_BATCH}
       )`,
      [now],
    );
    const tickets = await this.pool.query(
      `DELETE FROM ws_tickets
       WHERE id IN (
         SELECT id FROM ws_tickets
         WHERE expires_at < $1 OR consumed_at IS NOT NULL AND consumed_at < $1 - interval '1 hour'
         LIMIT ${AUTH_SWEEP_BATCH}
       )`,
      [now],
    );
    const sessions = await this.pool.query(
      `UPDATE sessions SET revoked_at = $1
       WHERE id IN (SELECT id FROM sessions
         WHERE revoked_at IS NULL AND (expires_at < $1 OR idle_expires_at < $1)
         LIMIT ${AUTH_SWEEP_BATCH})`,
      [now],
    );
    return {
      oauth: oauth.rowCount ?? 0,
      tickets: tickets.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
    };
  }

  async purgeRetention(now = new Date()): Promise<{ samples: number; events: number; commands: number }> {
    const sampleCutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
    const eventCutoff = new Date(now.getTime() - NINETY_DAYS_MS);
    const commandCutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
    const samples = await this.pool.query(
      `DELETE FROM telemetry_samples
       WHERE ctid IN (
         SELECT ctid FROM telemetry_samples WHERE sampled_at < $1 LIMIT ${RETENTION_BATCH}
       )`,
      [sampleCutoff],
    );
    const events = await this.pool.query(
      `DELETE FROM events
       WHERE id IN (
         SELECT id FROM events WHERE created_at < $1 LIMIT ${RETENTION_BATCH}
       )`,
      [eventCutoff],
    );
    const commands = await this.pool.query(
      `DELETE FROM commands
       WHERE id IN (
         SELECT id FROM commands WHERE requested_at < $1 LIMIT ${RETENTION_BATCH}
       )`,
      [commandCutoff],
    );
    return {
      samples: samples.rowCount ?? 0,
      events: events.rowCount ?? 0,
      commands: commands.rowCount ?? 0,
    };
  }

  async getFarmLockKey(farmId: string): Promise<number> {
    const result = await this.pool.query<{ controller_lock_key: string }>(
      'SELECT controller_lock_key FROM farms WHERE id = $1',
      [farmId],
    );
    if (!result.rows[0]) throw new Error('Farm not found.');
    return Number(result.rows[0].controller_lock_key);
  }

  async databaseStatus(farmId: string) {
    return withTransaction(this.pool, async (client) => {
      await client.query('SET TRANSACTION READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5s'");
      const tables = [];
      for (const [table, timestamp, days] of [
        ['telemetry_samples', 'sampled_at', 30], ['events', 'created_at', 90], ['commands', 'requested_at', 30],
      ] as const) {
        const result = await client.query(`SELECT count(*)::int AS rows,
          min(${timestamp}) AS oldest,
          count(*) FILTER (WHERE ${timestamp} < now() - $2 * interval '1 day')::int AS expired_rows,
          pg_table_size($3::regclass)::float8 AS table_bytes,
          pg_indexes_size($3::regclass)::float8 AS index_bytes
          FROM ${table} WHERE farm_id = $1`, [farmId, days, table]);
        tables.push({ table, retentionDays: days, ...result.rows[0] });
      }
      const migrations = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      return { observedAt: new Date().toISOString(), tables,
        migrations: migrations.rows.map((row) => String(row.version)),
        sizeScope: 'Physical table/index bytes include the database relation; row counts are restricted to this farm.' };
    });
  }
}

export { DEFAULT_AUTOMATIONS, automationSettingsSchema, isPgCheckViolation };

export function isConstraintError(error: unknown) {
  return isPgCheckViolation(error) || isPgUniqueViolation(error);
}
