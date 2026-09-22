import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('uses the authenticated farm for HTTP reads, commands and WebSocket tickets', async () => {
  const farmId = 'cad2a8fd-265e-491d-a768-b4372580b55e';
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/v1/session'
    ? { authenticated: true, farmId, csrfToken: 'test-csrf', localLogin: false } : {}), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const api = await import('./api');
  // A page data request may precede the session query: resolve identity first.
  await api.fetchSnapshot();
  await api.fetchMembers();
  await api.fetchEvents();
  await api.sendCommand({ type: 'fan.set', on: true });
  await api.createRealtimeTicket();
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(calls.slice(1, 5).map(([url]) => url)).toEqual([
    `/api/v1/farms/${farmId}/snapshot`, `/api/v1/farms/${farmId}/members`,
    `/api/v1/farms/${farmId}/events`, `/api/v1/farms/${farmId}/commands`,
  ]);
  expect(calls[5]![0]).toBe('/api/v1/realtime/tickets');
  expect(JSON.parse(calls[5]![1].body as string)).toEqual({ farmId });
  expect(new Headers(calls[5]![1].headers).get('x-csrf-token')).toBe('test-csrf');
});

it('does not reuse a previous farm after the session becomes anonymous', async () => {
  let authenticated = true;
  const fetch = vi.fn(async () => new Response(JSON.stringify({ authenticated,
    farmId: authenticated ? 'cad2a8fd-265e-491d-a768-b4372580b55e' : null,
    csrfToken: authenticated ? 'test-csrf' : null, localLogin: false }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const api = await import('./api');
  await api.ensureSession();
  authenticated = false;
  await api.ensureSession();
  await expect(api.createRealtimeTicket()).rejects.toThrow('Sign in to select a farm.');
  expect(fetch.mock.calls).toHaveLength(3);
});
