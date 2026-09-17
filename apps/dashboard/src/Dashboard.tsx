import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Switch,
  Text,
  Title1,
  Title3,
} from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FarmCommandRequest, FarmSnapshot } from '@smartfarm/contracts';
import { ensureSession, fetchSnapshot, sendCommand } from './api';

function formatValue(value: number | boolean | null | undefined, unit = '') {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return `${value}${unit}`;
}

function SensorCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="sensor-card">
      <Text className="sensor-label">{label}</Text>
      <Text className="sensor-value" weight="semibold">
        {value}
      </Text>
      {hint ? (
        <Text size={200} className="sensor-hint">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function statusIntent(status: FarmSnapshot['connection']['status']) {
  if (status === 'live') return 'success' as const;
  if (status === 'stale') return 'warning' as const;
  return 'danger' as const;
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [lcd1, setLcd1] = useState('');
  const [lcd2, setLcd2] = useState('');

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: ensureSession,
    retry: 0,
  });

  const snapshotQuery = useQuery({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
    enabled: sessionQuery.data?.authenticated === true,
    refetchInterval: 800,
  });

  const command = useMutation({
    mutationFn: (body: FarmCommandRequest) => sendCommand(body),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const snapshot = snapshotQuery.data;
  const queryError = snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null;
  const visibleError = error ?? queryError;
  const readings = snapshot?.readings;
  const pending = Boolean(snapshot?.pendingCommands.length);

  return (
    <>
      <header className="section">
        <Title1>TT SmartFarm</Title1>
        <Text as="p">Web controller. The MQTT client never runs in this browser.</Text>
        {snapshot ? (
          <div className="status-row">
            <Badge appearance="filled" color={statusIntent(snapshot.connection.status)}>
              {snapshot.connection.status}
            </Badge>
            {snapshot.simulation ? <Badge appearance="outline">Simulation</Badge> : null}
            <Text size={200}>
              {snapshot.connection.transport} · age{' '}
              {snapshot.connection.telemetryAgeMs == null
                ? 'n/a'
                : `${snapshot.connection.telemetryAgeMs} ms`}
            </Text>
          </div>
        ) : (
          <Spinner label="Connecting to the local controller…" />
        )}
      </header>

      {snapshot?.simulation ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Simulation</MessageBarTitle>
            Commands go to a local farm model, not the physical ESP32.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {visibleError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Command failed</MessageBarTitle>
            {visibleError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      <section className="section">
        <Title3>Sensors</Title3>
        <div className={`sensor-grid ${snapshot?.connection.fresh ? '' : 'stale'}`}>
          <SensorCard
            label="Temperature"
            value={formatValue(readings?.temperatureC, '°C')}
            hint={readings?.dhtHealthy === false ? 'DHT11 unavailable' : undefined}
          />
          <SensorCard label="Humidity" value={formatValue(readings?.humidityPct, '%')} />
          <SensorCard label="Soil" value={formatValue(readings?.soilPct, '%')} />
          <SensorCard
            label="Tank"
            value={formatValue(readings?.waterPct, '%')}
            hint={
              readings?.pumpBlocked === 1
                ? 'Low tank'
                : readings?.pumpBlocked === 2
                  ? 'No valid water sample'
                  : undefined
            }
          />
          <SensorCard label="Roof light" value={formatValue(readings?.lightRaw)} />
          <SensorCard
            label="Rain / steam"
            value={readings?.rain == null ? 'Unavailable' : readings.rain ? 'Rain' : 'Dry'}
            hint={readings?.steamRaw == null ? undefined : `ADC ${readings.steamRaw}`}
          />
          <SensorCard label="Distance" value={formatValue(readings?.distanceCm, ' cm')} />
          <SensorCard label="Motion" value={formatValue(readings?.pir)} />
          <SensorCard label="Button" value={formatValue(readings?.button)} />
          <SensorCard label="RSSI" value={formatValue(readings?.rssiDbm, ' dBm')} />
        </div>
      </section>

      <section className="section">
        <Title3>Controls</Title3>
        <Text as="p" data-testid="control-status">
          {pending ? 'Waiting for the farm to confirm a command.' : 'Ready for manual commands.'}
        </Text>
        <div className="control-row">
          <Switch
            label="Fan"
            checked={Boolean(readings?.fan)}
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onChange={(_, data) => command.mutate({ type: 'fan.set', on: data.checked })}
          />
          <Switch
            label="Light"
            checked={Boolean(readings?.led)}
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onChange={(_, data) => command.mutate({ type: 'light.set', on: data.checked })}
          />
          <Switch
            label="Feeder"
            checked={Boolean(readings?.feederOpen)}
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onChange={(_, data) => command.mutate({ type: 'feeder.set', open: data.checked })}
          />
          <Switch
            label="Backlight"
            checked={Boolean(readings?.backlight)}
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onChange={(_, data) => command.mutate({ type: 'lcd.setBacklight', on: data.checked })}
          />
        </div>
        <div className="control-row">
          <Button
            appearance="primary"
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onClick={() => command.mutate({ type: 'pump.pulse' })}
          >
            Water briefly
          </Button>
          <Button
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onClick={() => command.mutate({ type: 'pump.stop' })}
          >
            Stop pump
          </Button>
          <Button
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onClick={() => command.mutate({ type: 'buzzer.beep', frequencyHz: 880 })}
          >
            Beep
          </Button>
          <Button
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onClick={() => command.mutate({ type: 'buzzer.stop' })}
          >
            Silence
          </Button>
          <Button
            appearance="secondary"
            data-testid="host-all-off"
            disabled={!snapshot?.permissions.canControl || command.isPending}
            onClick={() => command.mutate({ type: 'farm.allOff' })}
          >
            All off
          </Button>
          <Dialog>
            <DialogTrigger disableButtonEnhancement>
              <Button>LCD text</Button>
            </DialogTrigger>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>LCD text</DialogTitle>
                <DialogContent className="lcd-fields">
                  <Input
                    value={lcd1}
                    maxLength={16}
                    placeholder="Line 1"
                    onChange={(_, data) => setLcd1(data.value)}
                  />
                  <Input
                    value={lcd2}
                    maxLength={16}
                    placeholder="Line 2"
                    onChange={(_, data) => setLcd2(data.value)}
                  />
                </DialogContent>
                <DialogActions>
                  <DialogTrigger disableButtonEnhancement>
                    <Button
                      appearance="primary"
                      onClick={() => command.mutate({ type: 'lcd.setText', line1: lcd1, line2: lcd2 })}
                    >
                      Send
                    </Button>
                  </DialogTrigger>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
        <Text as="p" size={200}>
          Pump {formatValue(readings?.pump)} · Buzzer {formatValue(readings?.buzzer)} · LCD{' '}
          {snapshot ? `${snapshot.lcd.line1} | ${snapshot.lcd.line2}` : '—'}
        </Text>
      </section>
    </>
  );
}
