import {
  type AutomationSettings,
  type FarmCommandRequest,
  type FarmEventDto,
  type FarmSnapshot,
  type HistorySeries,
  type HistorySeriesPointDto,
  type RuleId,
  type SessionDto,
} from '@smartfarm/contracts';

let csrfToken: string | null = null;
let sessionFarmId: string | null = null;

async function currentFarmId() {
  if (!sessionFarmId) await ensureSession();
  if (!sessionFarmId) throw new Error('Sign in to select a farm.');
  return sessionFarmId;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken && init.method && init.method !== 'GET') headers.set('x-csrf-token', csrfToken);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  const body = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body ? body.error?.message : response.statusText;
    throw new Error(message || 'Request failed.');
  }
  return body as T;
}

export async function ensureSession(): Promise<SessionDto> {
  const session = await request<SessionDto>('/api/v1/session');
  if (session.authenticated) {
    csrfToken = session.csrfToken;
    sessionFarmId = session.farmId;
    return session;
  }
  sessionFarmId = null;
  if (session.localLogin) {
    const login = await request<SessionDto>('/api/v1/local/login', { method: 'POST' });
    csrfToken = login.csrfToken;
    sessionFarmId = login.farmId;
    return login;
  }
  return session;
}

export function logout() {
  sessionFarmId = null;
  csrfToken = null;
  return request<{ ok: boolean }>('/api/v1/logout', { method: 'POST' });
}

export async function fetchSnapshot() {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/snapshot`);
}

export async function sendCommand(command: FarmCommandRequest) {
  return request(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/commands`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(command),
  });
}

export async function startAutomations() {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export async function pauseAutomations() {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/pause`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export async function saveAutomationSettings(draft: AutomationSettings, expectedRevision: number) {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/settings`, {
    method: 'PUT',
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
      'If-Match': String(expectedRevision),
    },
    body: JSON.stringify(draft),
  });
}

export async function resumeAutomationRule(rule: RuleId) {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/resume-rule`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ rule }),
  });
}

export async function resetWatering() {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/reset-watering`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export async function syncGuard() {
  return request<FarmSnapshot>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/automations/sync-guard`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export async function createRealtimeTicket(signal?: AbortSignal) {
  return request<{ ticket: string; expiresAt: string; wsUrl: string }>('/api/v1/realtime/tickets', {
    method: 'POST',
    signal,
    body: JSON.stringify({ farmId: await currentFarmId() }),
  });
}

export async function fetchHistory(path: HistorySeries, from: string, to: string) {
  const params = new URLSearchParams({ path, from, to });
  return request<{ path: string; from: string; to: string; points: HistorySeriesPointDto[] }>(
    `/api/v1/farms/${encodeURIComponent(await currentFarmId())}/history?${params}`,
  );
}

export async function fetchEvents(cursor?: string | null) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const suffix = params.size ? `?${params}` : '';
  return request<{ events: FarmEventDto[]; nextCursor: { createdAt: string; id: string } | null }>(
    `/api/v1/farms/${encodeURIComponent(await currentFarmId())}/events${suffix}`,
  );
}

export async function fetchMembers() {
  return request<{
    members: Array<{ githubId: string; username: string; role: string; allowlisted: boolean }>;
  }>(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/members`);
}

export function fetchDiagnostics() {
  return request<Record<string, unknown>>('/api/v1/diagnostics');
}

export async function setMemberRole(githubId: string, role: 'viewer' | 'operator' | 'admin') {
  return request(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/members/${encodeURIComponent(githubId)}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(githubId: string) {
  return request(`/api/v1/farms/${encodeURIComponent(await currentFarmId())}/members/${encodeURIComponent(githubId)}`, {
    method: 'DELETE',
  });
}
