import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Text,
} from '@fluentui/react-components';
import { useState } from 'react';
import type { AutomationPanelPropsV1 } from '@smartfarm/contracts';
import { automationPanelContract } from './contract';

type ProbeProps = Partial<AutomationPanelPropsV1> & {
  onNotify?: (message: string) => void;
};

export function AutomationPanel({ farmName = 'TT SmartFarm', onNotify }: ProbeProps) {
  const [count, setCount] = useState(0);

  return (
    <div data-testid="federation-probe">
      <Text as="p">Federated editor for {farmName}</Text>
      <Text as="p" data-testid="hook-count">
        Hook count: {count}
      </Text>
      <Button data-testid="increment-hook" onClick={() => setCount((value) => value + 1)}>
        Increment
      </Button>
      <Dialog>
        <DialogTrigger disableButtonEnhancement>
          <Button appearance="primary" data-testid="open-dialog">
            Open editor preview
          </Button>
        </DialogTrigger>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Automation editor</DialogTitle>
            <DialogContent>
              This dialog is rendered by the remote using the host Fluent theme. Contract major{' '}
              {automationPanelContract.contractVersion}.
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button
                  appearance="primary"
                  data-testid="notify-host"
                  onClick={() => onNotify?.('Remote dialog used a React hook and notified the host.')}
                >
                  Notify host
                </Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
