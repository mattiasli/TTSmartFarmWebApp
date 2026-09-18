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
  try {
    const ticket = await createRealtimeTicket();
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(wsUrlFromTicket(ticket.wsUrl));
      let epoch: string | null = null;
      let sequence = -1;
      let settled = false;
      const finish = (fallback: boolean) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (fallback && !signal.aborted) onStatus('poll');
        resolve();
      };
      const onAbort = () => {
        try {
          socket.close();
        } catch {
          // ignore
        }
        finish(false);
      };
      signal.addEventListener('abort', onAbort);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket }));
      });
      socket.addEventListener('message', (event) => {
        try {
          const parsed = realtimeEnvelopeSchema.parse(JSON.parse(String(event.data)));
          if (parsed.type !== 'snapshot') return;
          if (!shouldAcceptEnvelope({ epoch, sequence }, parsed)) return;
          epoch = parsed.serverEpoch;
          sequence = parsed.sequence;
          onSnapshot(parsed.data as FarmSnapshot);
          onStatus('websocket');
        } catch {
          // Ignore malformed frames; HTTP poll remains the fallback.
        }
      });
      socket.addEventListener('close', () => finish(true));
      socket.addEventListener('error', () => finish(true));
    });
  } catch {
    if (!signal.aborted) onStatus('poll');
  }
}
