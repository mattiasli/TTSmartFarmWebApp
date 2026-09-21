import { realtimeEnvelopeSchema, type FarmSnapshot, type RealtimeEnvelope } from '@smartfarm/contracts';
import { createRealtimeTicket } from './api';

export type LiveState = {
  snapshot: FarmSnapshot | null;
  transport: 'websocket' | 'poll' | 'offline';
  error: string | null;
};

function wsUrlFromTicket(wsUrl: string) {
  if (wsUrl.startsWith('ws:') || wsUrl.startsWith('wss:')) {
    if (wsUrl.includes('127.0.0.1:3001') || wsUrl.includes('localhost:3001')) {
      const parsed = new URL(wsUrl);
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}${parsed.pathname}`;
    }
    return wsUrl;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function shouldAcceptEnvelope(
  current: { epoch: string | null; sequence: number },
  next: RealtimeEnvelope,
) {
  if (current.epoch !== next.serverEpoch) return true;
  return next.sequence >= current.sequence;
}

export async function connectFarmSocket(
  onSnapshot: (snapshot: FarmSnapshot) => void,
  onStatus: (transport: LiveState['transport']) => void,
  signal: AbortSignal,
) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      // Tickets are single-use. Every connection attempt obtains a new one.
      const ticket = await createRealtimeTicket(AbortSignal.any([signal, AbortSignal.timeout(10_000)]));
      if (signal.aborted) return;
      const receivedSnapshot = await new Promise<boolean>((resolve) => {
        const socket = new WebSocket(wsUrlFromTicket(ticket.wsUrl));
        let epoch: string | null = null;
        let sequence = -1;
        let settled = false;
        let received = false;
        let deadline: ReturnType<typeof setTimeout>;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          signal.removeEventListener('abort', finish);
          socket.removeEventListener('open', opened);
          socket.removeEventListener('message', message);
          socket.removeEventListener('close', finish);
          socket.removeEventListener('error', finish);
          try { socket.close(); } catch { /* already disconnected */ }
          resolve(received);
        };
        const opened = () => {
          try { socket.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket })); }
          catch { finish(); }
        };
        const message = (event: MessageEvent) => {
          try {
            const parsed = realtimeEnvelopeSchema.parse(JSON.parse(String(event.data)));
            if (parsed.type !== 'snapshot' || !shouldAcceptEnvelope({ epoch, sequence }, parsed)) return;
            epoch = parsed.serverEpoch;
            sequence = parsed.sequence;
            received = true;
            clearTimeout(deadline);
            // A silent socket must not disable HTTP polling indefinitely.
            deadline = setTimeout(finish, 5_000);
            onSnapshot(parsed.data as FarmSnapshot);
            onStatus('websocket');
          } catch {
            // Invalid messages do not extend the snapshot deadline.
          }
        };
        deadline = setTimeout(finish, 10_000);
        signal.addEventListener('abort', finish, { once: true });
        socket.addEventListener('open', opened);
        socket.addEventListener('message', message);
        socket.addEventListener('close', finish);
        socket.addEventListener('error', finish);
        if (signal.aborted) finish();
      });
      if (receivedSnapshot) failures = 0;
    } catch {
      // Ticket/connection failures use polling while the next attempt backs off.
    }
    if (signal.aborted) return;
    onStatus('poll');
    const base = Math.min(30_000, 1_000 * 2 ** failures);
    failures = Math.min(failures + 1, 5);
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.ceil(base * (0.5 + Math.random() * 0.5)));
      signal.addEventListener('abort', finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
