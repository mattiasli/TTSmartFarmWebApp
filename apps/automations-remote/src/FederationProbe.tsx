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

export function FederationProbe({ onNotify }: { onNotify?: (message: string) => void }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="federation-probe">
      <Text as="p">Federated editor for TT SmartFarm</Text>
      <Text as="p" data-testid="hook-count">
        Hook count: {count}
      </Text>
      <Button data-testid="increment-hook" onClick={() => setCount((value) => value + 1)}>
        Increment
      </Button>
      <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button appearance="primary" data-testid="open-dialog">
            Open editor preview
          </Button>
        </DialogTrigger>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Automation editor</DialogTitle>
            <DialogContent>
              This dialog is rendered by the remote using the host Fluent theme.
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                data-testid="notify-host"
                onClick={() => {
                  const message = 'Remote dialog used a React hook and notified the host.';
                  onNotify?.(message);
                  window.dispatchEvent(new CustomEvent('smartfarm-federation-notify', { detail: message }));
                  setOpen(false);
                }}
              >
                Notify host
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
