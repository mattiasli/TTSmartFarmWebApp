import {
  LOCAL_FARM_ID,
  type FarmCommandRequest,
  type FarmSnapshot,
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
  if (!session.localLogin) throw new Error('Sign in is required.');
  const login = await request<SessionDto>('/api/v1/local/login', { method: 'POST' });
  csrfToken = login.csrfToken;
  return login;
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
