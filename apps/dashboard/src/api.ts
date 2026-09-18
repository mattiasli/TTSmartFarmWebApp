import {
  LOCAL_FARM_ID,
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
    return session;
  }
  if (session.localLogin) {
    const login = await request<SessionDto>('/api/v1/local/login', { method: 'POST' });
    csrfToken = login.csrfToken;
    return login;
  }
  return session;
}

export function logout() {
  csrfToken = null;
  return request<{ ok: boolean }>('/api/v1/logout', { method: 'POST' });
}

export function fetchSnapshot() {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/snapshot`);
}

export function sendCommand(command: FarmCommandRequest) {
  return request(`/api/v1/farms/${LOCAL_FARM_ID}/commands`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(command),
  });
}

export function startAutomations() {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function pauseAutomations() {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/pause`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function saveAutomationSettings(draft: AutomationSettings, expectedRevision: number) {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/settings`, {
    method: 'PUT',
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
      'If-Match': String(expectedRevision),
    },
    body: JSON.stringify(draft),
  });
}

export function resumeAutomationRule(rule: RuleId) {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/resume-rule`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ rule }),
  });
}

export function resetWatering() {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/reset-watering`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function syncGuard() {
  return request<FarmSnapshot>(`/api/v1/farms/${LOCAL_FARM_ID}/automations/sync-guard`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function createRealtimeTicket() {
  return request<{ ticket: string; expiresAt: string; wsUrl: string }>('/api/v1/realtime/tickets', {
    method: 'POST',
    body: JSON.stringify({ farmId: LOCAL_FARM_ID }),
  });
}

export function fetchHistory(path: HistorySeries, from: string, to: string) {
  const params = new URLSearchParams({ path, from, to });
  return request<{ path: string; from: string; to: string; points: HistorySeriesPointDto[] }>(
    `/api/v1/farms/${LOCAL_FARM_ID}/history?${params}`,
  );
}

export function fetchEvents(cursor?: string | null) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const suffix = params.size ? `?${params}` : '';
  return request<{ events: FarmEventDto[]; nextCursor: { createdAt: string; id: string } | null }>(
    `/api/v1/farms/${LOCAL_FARM_ID}/events${suffix}`,
  );
}

export function fetchMembers() {
  return request<{
    members: Array<{ githubId: string; username: string; role: string; allowlisted: boolean }>;
  }>(`/api/v1/farms/${LOCAL_FARM_ID}/members`);
}

export function fetchDiagnostics() {
  return request<Record<string, unknown>>('/api/v1/diagnostics');
}

export function setMemberRole(githubId: string, role: 'viewer' | 'operator' | 'admin') {
  return request(`/api/v1/farms/${LOCAL_FARM_ID}/members/${encodeURIComponent(githubId)}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export function removeMember(githubId: string) {
  return request(`/api/v1/farms/${LOCAL_FARM_ID}/members/${encodeURIComponent(githubId)}`, {
    method: 'DELETE',
  });
}
