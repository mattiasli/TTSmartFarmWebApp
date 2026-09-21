import { Button } from '@fluentui/react-components';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FarmSnapshot } from '@smartfarm/contracts';
import { pauseAutomations, sendCommand, startAutomations } from './api';

export function HostControls({
  snapshot,
  onError,
}: {
  snapshot?: FarmSnapshot;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const canControl = Boolean(snapshot?.permissions.canControl);
  const automations = useMutation({
    mutationFn: (action: 'start' | 'pause') => (action === 'start' ? startAutomations() : pauseAutomations()),
    onSuccess: async (next) => {
      onError(null);
      queryClient.setQueryData(['snapshot'], next);
    },
    onError: (err: Error) => onError(err.message),
  });
  const allOff = useMutation({
    mutationFn: () => sendCommand({ type: 'farm.allOff' }),
    onSuccess: async () => {
      onError(null);
      await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    },
    onError: (err: Error) => onError(err.message),
  });

  return (
    <div className="host-emergency" data-testid="host-emergency">
      <Button
        appearance="primary"
        data-testid="start-automations"
        disabled={!canControl || automations.isPending || !snapshot?.connection.fresh || !snapshot.connection.controllerReady || !snapshot.connection.brokerReady}
        onClick={() => automations.mutate('start')}
      >
        Start
      </Button>
      <Button
        data-testid="pause-automations"
        disabled={!canControl || automations.isPending}
        onClick={() => automations.mutate('pause')}
      >
        Pause
      </Button>
      <Button
        appearance="secondary"
        data-testid="host-all-off"
        disabled={!canControl || allOff.isPending}
        onClick={() => allOff.mutate()}
      >
        All off
      </Button>
    </div>
  );
}
