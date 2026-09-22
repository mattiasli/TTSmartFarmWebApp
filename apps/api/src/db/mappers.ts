import type { AutomationSettings, CommandDto, FarmCommandRequest, RuleId } from '@smartfarm/contracts';
import type {
  AllowlistRecord,
  AutomationConfigRecord,
  AutomationRuntimeRecord,
  CommandRecord,
  EventRecord,
  FarmPreferenceRecord,
  FarmRole,
  GuardStatus,
  MembershipRecord,
  OauthFlowRecord,
  SessionRecord,
  TelemetrySampleRecord,
  UserRecord,
  WsTicketRecord,
} from './types';

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  throw new Error('Expected a timestamp.');
}

function asDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  return asDate(value);
}

export function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    githubId: row.github_id == null ? null : String(row.github_id),
    username: String(row.username),
    displayName: row.display_name == null ? null : String(row.display_name),
    disabledAt: asDateOrNull(row.disabled_at),
  };
}

export function mapMembership(row: Record<string, unknown>): MembershipRecord {
  return {
    farmId: String(row.farm_id),
    userId: String(row.user_id),
    role: row.role as FarmRole,
  };
}

export function mapAllowlist(row: Record<string, unknown>): AllowlistRecord {
  return {
    githubId: String(row.github_id),
    farmId: String(row.farm_id),
    role: row.role as FarmRole,
    createdBy: row.created_by == null ? null : String(row.created_by),
    revokedAt: asDateOrNull(row.revoked_at),
  };
}

export function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    userId: String(row.user_id),
    csrfSecret: String(row.csrf_secret),
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    idleExpiresAt: asDate(row.idle_expires_at),
    lastSeenAt: asDate(row.last_seen_at),
    revokedAt: asDateOrNull(row.revoked_at),
  };
}

export function mapOauthFlow(row: Record<string, unknown>): OauthFlowRecord {
  return {
    id: String(row.id),
    stateHash: String(row.state_hash),
    browserBindingHash: String(row.browser_binding_hash),
    pkceVerifier: String(row.pkce_verifier),
    environment: String(row.environment),
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    consumedAt: asDateOrNull(row.consumed_at),
  };
}

export function mapTicket(row: Record<string, unknown>): WsTicketRecord {
  return {
    id: String(row.id),
    ticketHash: String(row.ticket_hash),
    sessionId: String(row.session_id),
    farmId: String(row.farm_id),
    origin: String(row.origin),
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    consumedAt: asDateOrNull(row.consumed_at),
  };
}

export function mapConfig(row: Record<string, unknown>): AutomationConfigRecord {
  return {
    farmId: String(row.farm_id),
    revision: Number(row.revision),
    settings: row.settings as AutomationSettings,
    editorUserId: row.editor_user_id == null ? null : String(row.editor_user_id),
    schemaVersion: Number(row.schema_version ?? 1),
    updatedAt: asDate(row.updated_at),
  };
}

export function mapRuntime(row: Record<string, unknown>): AutomationRuntimeRecord {
  const overrides = Array.isArray(row.manual_overrides) ? (row.manual_overrides as RuleId[]) : [];
  const target = row.guard_target as { tankLow?: number; tankRecover?: number } | null;
  return {
    farmId: String(row.farm_id),
    runtimeRevision: Number(row.runtime_revision),
    pausedReason: String(row.paused_reason),
    masterEnabled: Boolean(row.master_enabled),
    manualOverrides: overrides,
    attempts: Number(row.attempts),
    lastPumpStopAt: asDateOrNull(row.last_pump_stop_at),
    cooldownUntil: asDateOrNull(row.cooldown_until),
    guardTarget:
      target && typeof target.tankLow === 'number' && typeof target.tankRecover === 'number'
        ? { tankLow: target.tankLow, tankRecover: target.tankRecover }
        : null,
    guardStatus: row.guard_status as GuardStatus,
    updatedAt: asDate(row.updated_at),
  };
}

export function mapPreferences(row: Record<string, unknown>): FarmPreferenceRecord {
  return {
    farmId: String(row.farm_id),
    lcdLine1: String(row.lcd_line1),
    lcdLine2: String(row.lcd_line2),
    lcdMode: row.lcd_mode as 'status' | 'custom',
    changedBy: row.changed_by == null ? null : String(row.changed_by),
    updatedAt: asDate(row.updated_at),
  };
}

export function mapCommand(row: Record<string, unknown>): CommandRecord {
  const payload = row.payload as FarmCommandRequest;
  const dto: CommandDto = {
    id: String(row.id),
    action: payload.type,
    status: row.status as CommandDto['status'],
    confirmationMode: row.confirmation_mode as CommandDto['confirmationMode'],
    requestedAt: asDate(row.requested_at).toISOString(),
    sentAt: asDateOrNull(row.sent_at)?.toISOString() ?? null,
    stateMatchedAt: asDateOrNull(row.state_matched_at)?.toISOString() ?? null,
    reason: row.reason == null ? null : String(row.reason),
  };
  return {
    ...dto,
    farmId: String(row.farm_id),
    actorScope: String(row.actor_scope),
    source: row.source as CommandRecord['source'],
    idempotencyKey: String(row.idempotency_key),
    requestHash: String(row.request_hash),
    payload,
    connectionEpoch: row.connection_epoch == null ? null : String(row.connection_epoch),
    receiveSequence: row.receive_sequence == null ? null : Number(row.receive_sequence),
    supersededBy: row.superseded_by == null ? null : String(row.superseded_by),
  };
}

export function mapEvent(row: Record<string, unknown>): EventRecord {
  return {
    id: String(row.id),
    farmId: String(row.farm_id),
    category: String(row.category),
    severity: row.severity as EventRecord['severity'],
    details: (row.details as Record<string, unknown>) ?? {},
    actorScope: row.actor_scope == null ? null : String(row.actor_scope),
    commandId: row.command_id == null ? null : String(row.command_id),
    serverEpoch: row.server_epoch == null ? null : String(row.server_epoch),
    serverSequence: row.server_sequence == null ? null : String(row.server_sequence),
    createdAt: asDate(row.created_at),
  };
}

export function mapSample(row: Record<string, unknown>): TelemetrySampleRecord {
  return {
    farmId: String(row.farm_id),
    sampledAt: asDate(row.sampled_at),
    payload: (row.payload as Record<string, unknown>) ?? {},
  };
}
