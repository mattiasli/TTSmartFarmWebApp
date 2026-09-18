import type { AutomationSettings, CommandDto, FarmCommandRequest, RuleId } from '@smartfarm/contracts';

export type FarmRole = 'viewer' | 'operator' | 'admin';

export type UserRecord = {
  id: string;
  githubId: string;
  username: string;
  displayName: string | null;
  disabledAt: Date | null;
};

export type MembershipRecord = {
  farmId: string;
  userId: string;
  role: FarmRole;
};

export type AllowlistRecord = {
  githubId: string;
  farmId: string;
  role: FarmRole;
  createdBy: string | null;
  revokedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  csrfSecret: string;
  createdAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type OauthFlowRecord = {
  id: string;
  stateHash: string;
  browserBindingHash: string;
  pkceVerifier: string;
  environment: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type WsTicketRecord = {
  id: string;
  ticketHash: string;
  sessionId: string;
  farmId: string;
  origin: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type AutomationConfigRecord = {
  farmId: string;
  revision: number;
  settings: AutomationSettings;
  editorUserId: string | null;
  schemaVersion: number;
  updatedAt: Date;
};

export type GuardStatus = 'unknown' | 'pending' | 'confirmed' | 'failed';

export type AutomationRuntimeRecord = {
  farmId: string;
  runtimeRevision: number;
  pausedReason: string;
  masterEnabled: boolean;
  manualOverrides: RuleId[];
  attempts: number;
  lastPumpStopAt: Date | null;
  cooldownUntil: Date | null;
  guardTarget: { tankLow: number; tankRecover: number } | null;
  guardStatus: GuardStatus;
  updatedAt: Date;
};

export type FarmPreferenceRecord = {
  farmId: string;
  lcdLine1: string;
  lcdLine2: string;
  lcdMode: 'status' | 'custom';
  changedBy: string | null;
  updatedAt: Date;
};

export type CommandRecord = CommandDto & {
  farmId: string;
  actorScope: string;
  source: 'user' | 'automation' | 'system';
  idempotencyKey: string;
  requestHash: string;
  payload: FarmCommandRequest;
  connectionEpoch: string | null;
  receiveSequence: number | null;
  supersededBy: string | null;
};

export type EventRecord = {
  id: string;
  farmId: string;
  category: string;
  severity: 'debug' | 'info' | 'warning' | 'error';
  details: Record<string, unknown>;
  actorScope: string | null;
  commandId: string | null;
  serverEpoch: string | null;
  serverSequence: string | null;
  createdAt: Date;
};

export type TelemetrySampleRecord = {
  farmId: string;
  sampledAt: Date;
  payload: Record<string, unknown>;
};

export type HistorySeriesPoint = {
  bucket: Date;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
};

export type EventCursor = {
  createdAt: string;
  id: string;
};
