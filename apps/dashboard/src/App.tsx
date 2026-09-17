import { Button, Text, Title1, Title3 } from '@fluentui/react-components';
import { lazy, Suspense, useState } from 'react';
import { RemoteBoundary } from './RemoteBoundary';

const AutomationPanel = lazy(() => import('smartfarm_automations/AutomationPanel'));

export function App() {
  const [hostMessage, setHostMessage] = useState('Waiting for the federated editor.');
  const [remoteKey, setRemoteKey] = useState(0);

  return (
    <main className="page">
      <header>
        <Title1>TT SmartFarm</Title1>
        <Text>Simulator-ready web controller. The MQTT client never runs in this browser.</Text>
      </header>
      <section>
        <Title3>Host controls</Title3>
        <Text className="host-message" data-testid="host-message">
          {hostMessage}
        </Text>
        <Button appearance="secondary" data-testid="host-all-off">
          All off
        </Button>
      </section>
      <section>
        <Title3>Automation editor</Title3>
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
  );
}
