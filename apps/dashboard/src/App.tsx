import { Text, Title3 } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { AutomationPanelPropsV1, FarmSnapshot } from '@smartfarm/contracts';
import {
  ensureSession,
  fetchSnapshot,
  resetWatering,
  resumeAutomationRule,
  saveAutomationSettings,
  syncGuard,
} from './api';
import { Dashboard } from './Dashboard';
import { RemoteBoundary } from './RemoteBoundary';

const AutomationPanel = lazy(() => import('smartfarm_automations/AutomationPanel'));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});

export function App() {
  const [hostMessage, setHostMessage] = useState('Waiting for the federated editor.');
  const [remoteKey, setRemoteKey] = useState(0);

  useEffect(() => {
    const onRemoteNotify = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') setHostMessage(detail);
    };
    window.addEventListener('smartfarm-federation-notify', onRemoteNotify);
    return () => window.removeEventListener('smartfarm-federation-notify', onRemoteNotify);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="page">
        <Dashboard />
        <section className="section">
          <Title3>Automation editor</Title3>
          <p data-testid="federation-host-message">{hostMessage}</p>
          <RemoteBoundary onRetry={() => setRemoteKey((value) => value + 1)}>
            <EditorHost key={remoteKey} onNotify={(message) => setHostMessage(message)} />
          </RemoteBoundary>
        </section>
      </main>
    </QueryClientProvider>
  );
}

function mapReadings(snapshot: FarmSnapshot): AutomationPanelPropsV1['readings'] {
  const r = snapshot.readings;
  return {
    temperatureC: r?.temperatureC ?? null,
    humidityPct: r?.humidityPct ?? null,
    dhtHealthy: r?.dhtHealthy ?? null,
    soilPct: r?.soilPct ?? null,
    waterPct: r?.waterPct ?? null,
    lightRaw: r?.lightRaw ?? null,
    steamRaw: r?.steamRaw ?? null,
    rain: r?.rain ?? null,
    pir: r?.pir ?? null,
    pump: r?.pump ?? null,
    fan: r?.fan ?? null,
    led: r?.led ?? null,
    telemetryAgeMs: snapshot.connection.telemetryAgeMs,
    fresh: snapshot.connection.fresh,
  };
}

function EditorHost({ onNotify }: { onNotify: (message: string) => void }) {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: ensureSession, retry: 0 });
  const snapshotQuery = useQuery({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
    enabled: session.data?.authenticated === true,
    refetchInterval: 800,
  });
  const snapshot = snapshotQuery.data;

  const editorProps: Partial<AutomationPanelPropsV1> & { onNotify?: (message: string) => void } = snapshot
    ? {
        contractVersion: 1,
        farmName: snapshot.farmName,
        settings: snapshot.automations.settings,
        settingsRevision: snapshot.automations.revision,
        runtime: snapshot.automations.runtime,
        readings: mapReadings(snapshot),
        permissions: {
          canEdit: snapshot.permissions.canControl,
          canResume: snapshot.permissions.canControl,
        },
        connection: {
          fresh: snapshot.connection.fresh,
          controllerReady: snapshot.connection.controllerReady,
          mode: snapshot.mode,
        },
        onSave: async (draft, expectedRevision) => {
          const next = await saveAutomationSettings(draft, expectedRevision);
          await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
          onNotify('Remote dialog used a React hook and notified the host.');
          return {
            revision: next.automations.revision,
            settings: next.automations.settings,
            guardStatus: 'saved',
          };
        },
        onResumeRule: async (rule) => {
          await resumeAutomationRule(rule);
          await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        },
        onResetIrrigation: async () => {
          await resetWatering();
          await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        },
        onSyncGuard: async () => {
          await syncGuard();
          await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        },
        onNotify,
      }
    : { farmName: 'TT SmartFarm', onNotify };

  return (
    <Suspense fallback={<Text>Loading automation editor…</Text>}>
      <AutomationPanel {...editorProps} />
    </Suspense>
  );
}
