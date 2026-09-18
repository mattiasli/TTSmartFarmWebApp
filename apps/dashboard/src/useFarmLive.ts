import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FarmSnapshot, SessionDto } from '@smartfarm/contracts';
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
            canControl: role === 'operator' || role === 'admin',
          },
        });
      },
      setTransport,
      abort.signal,
    );
    return () => abort.abort();
  }, [queryClient, sessionQuery.data?.authenticated, sessionQuery.data?.role]);

  return {
    session: sessionQuery.data as SessionDto | undefined,
    sessionPending: sessionQuery.isPending,
    snapshot: snapshotQuery.data as FarmSnapshot | undefined,
    snapshotError: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    transport,
  };
}
