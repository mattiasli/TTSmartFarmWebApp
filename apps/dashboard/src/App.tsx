import { Text, Title3 } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Dashboard } from './Dashboard';
import { RemoteBoundary } from './RemoteBoundary';

const AutomationPanel = lazy(() => import('smartfarm_automations/AutomationPanel'));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});

export function App() {
  const [hostMessage, setHostMessage] = useState('Waiting for the federated editor.');
  const [remoteKey, setRemoteKey] = useState(0);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="page">
        <Dashboard />
        <section className="section">
          <Title3>Automation editor</Title3>
          <p data-testid="federation-host-message">{hostMessage}</p>
          <RemoteBoundary onRetry={() => setRemoteKey((value) => value + 1)}>
            <Suspense fallback={<Text>Loading automation editor…</Text>}>
              <AutomationPanel
                key={remoteKey}
                farmName="TT SmartFarm"
                onNotify={(message) => setHostMessage(message)}
              />
            </Suspense>
          </RemoteBoundary>
        </section>
      </main>
    </QueryClientProvider>
  );
}
