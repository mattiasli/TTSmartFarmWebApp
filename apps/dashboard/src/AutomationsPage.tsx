import { Text, Title3 } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import type { AutomationPanelPropsV1, FarmSnapshot } from '@smartfarm/contracts';
import { resetWatering, resumeAutomationRule, saveAutomationSettings, syncGuard } from './api';
import { useFarmLiveContext } from './FarmLiveContext';
import { loadAutomationPanel } from './loadAutomationPanel';
import { RemoteBoundary } from './RemoteBoundary';

const AutomationPanel = lazy(() => loadAutomationPanel());

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

export function AutomationsPage({ hostMessage }: { hostMessage: string }) {
  const live = useFarmLiveContext();
  const queryClient = useQueryClient();
  const snapshot = live.snapshot;
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
          canResume: snapshot.permissions.canControl && snapshot.connection.fresh && snapshot.connection.controllerReady && snapshot.connection.brokerReady,
        },
        connection: {
          fresh: snapshot.connection.fresh,
          controllerReady: snapshot.connection.controllerReady,
          mode: snapshot.mode,
        },
        onSave: async (draft, expectedRevision) => {
          const next = await saveAutomationSettings(draft, expectedRevision);
          queryClient.setQueryData(['snapshot'], next);
          window.dispatchEvent(
            new CustomEvent('smartfarm-federation-notify', {
              detail: 'Remote dialog used a React hook and notified the host.',
            }),
          );
          return {
            revision: next.automations.revision,
            settings: next.automations.settings,
            guardStatus: 'saved',
          };
        },
        onResumeRule: async (rule) => {
          const next = await resumeAutomationRule(rule);
          queryClient.setQueryData(['snapshot'], next);
        },
        onResetIrrigation: async () => {
          const next = await resetWatering();
          queryClient.setQueryData(['snapshot'], next);
        },
        onSyncGuard: async () => {
          const next = await syncGuard();
          queryClient.setQueryData(['snapshot'], next);
        },
        onNotify: (message) => {
          window.dispatchEvent(new CustomEvent('smartfarm-federation-notify', { detail: message }));
        },
      }
    : {
        farmName: 'TT SmartFarm',
        onNotify: (message) => {
          window.dispatchEvent(new CustomEvent('smartfarm-federation-notify', { detail: message }));
        },
      };

  return (
    <section className="section">
      <Title3>Automation editor</Title3>
      <p data-testid="federation-host-message">{hostMessage}</p>
      <Text as="p" data-testid="automation-master">
        {snapshot?.automations.runtime.masterEnabled
          ? 'Running on the server. Closing this tab does not pause them.'
          : snapshot?.automations.runtime.pausedReason || 'Paused — start explicitly.'}
      </Text>
      {/* Failed module imports are cached for this document. Reload to retry the
          trusted remote without changing server automation state. */}
      <RemoteBoundary onRetry={() => window.location.reload()}>
        <Suspense fallback={<Text>Loading automation editor…</Text>}>
          <AutomationPanel {...editorProps} />
        </Suspense>
      </RemoteBoundary>
    </section>
  );
}
