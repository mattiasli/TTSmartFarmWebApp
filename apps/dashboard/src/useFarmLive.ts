import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FRESH_MS, type FarmSnapshot, type SessionDto } from '@smartfarm/contracts';
import { ensureSession, fetchSnapshot } from './api';
import { connectFarmSocket, type LiveState } from './realtime';

export function useFarmLive() {
  const queryClient = useQueryClient();
  const [transport, setTransport] = useState<LiveState['transport']>('poll');
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: ensureSession,
    retry: 0,
  });
  const snapshotQuery = useQuery({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
    enabled: sessionQuery.data?.authenticated === true,
    refetchInterval: transport === 'websocket' ? false : 800,
  });

  const [ageClock, setAgeClock] = useState({ revision: 0, elapsed: 0 });
  useEffect(() => {
    // Age the last received snapshot even when both WSS and polling go silent.
    // dataUpdatedAt identifies receipt; wall-clock differences never measure age.
    const receivedAt = performance.now();
    const timer = setInterval(() => setAgeClock({
      revision: snapshotQuery.dataUpdatedAt, elapsed: performance.now() - receivedAt,
    }), 250);
    return () => clearInterval(timer);
  }, [snapshotQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated) return;
    const abort = new AbortController();
    const role = sessionQuery.data.role;
    void connectFarmSocket(
      (snapshot) => {
        queryClient.setQueryData(['snapshot'], {
          ...snapshot,
          permissions: {
            canView: true,
            canControl: snapshot.permissions.canControl && (role === 'operator' || role === 'admin'),
            canPump: Boolean(snapshot.permissions.canPump) && snapshot.permissions.canControl && (role === 'operator' || role === 'admin'),
          },
        });
      },
      setTransport,
      abort.signal,
    );
    return () => abort.abort();
  }, [queryClient, sessionQuery.data?.authenticated, sessionQuery.data?.role]);

  const received = snapshotQuery.data as FarmSnapshot | undefined;
  const elapsed = ageClock.revision === snapshotQuery.dataUpdatedAt ? ageClock.elapsed : 0;
  const age = received?.connection.telemetryAgeMs;
  const telemetryAgeMs = typeof age === 'number' ? age + elapsed : null;
  const fresh = Boolean(received?.connection.fresh && telemetryAgeMs !== null && telemetryAgeMs < FRESH_MS);
  const snapshot = received ? { ...received, connection: {
    ...received.connection, telemetryAgeMs, fresh,
    status: !fresh && received.connection.status === 'live' ? 'stale' as const : received.connection.status,
  } } : undefined;

  return {
    session: sessionQuery.data as SessionDto | undefined,
    sessionPending: sessionQuery.isPending,
    snapshot,
    snapshotError: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    transport,
  };
}
