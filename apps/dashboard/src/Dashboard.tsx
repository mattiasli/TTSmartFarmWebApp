import {
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
  Title3,
} from '@fluentui/react-components';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LCD_MAX_CHARS, type FarmCommandRequest } from '@smartfarm/contracts';
import { sendCommand } from './api';
import { useFarmLiveContext } from './FarmLiveContext';

const LCD_CHAR = /^[\x20-\x7b\x7d-\x7e]*$/;

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

export function Dashboard() {
  const queryClient = useQueryClient();
  const live = useFarmLiveContext();
  const [error, setError] = useState<string | null>(null);
  const [lcd1, setLcd1] = useState('');
  const [lcd2, setLcd2] = useState('');

  const command = useMutation({
    mutationFn: (body: FarmCommandRequest) => sendCommand(body),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const snapshot = live.snapshot;
  const readings = snapshot?.readings;
  const pending = snapshot?.pendingCommands ?? [];
  const pendingAction = (type: FarmCommandRequest['type']) => pending.some((row) => row.action === type);
  const lcdInvalid = !LCD_CHAR.test(lcd1) || !LCD_CHAR.test(lcd2);
  const alarmOwnsLcd = Boolean(snapshot?.automations.runtime.messages.alarm?.toLowerCase().includes('warning'));
  const canControl = Boolean(snapshot?.permissions.canControl) && !command.isPending;
  const banners = useMemo(() => {
    const items: string[] = [];
    if (readings?.pumpBlocked === 1) items.push('Tank is low — automatic watering stays blocked.');
    if (readings?.pumpBlocked === 2) items.push('Tank sample is invalid — pump starts stay blocked.');
    if (snapshot && !snapshot.automations.runtime.masterEnabled) {
      items.push(snapshot.automations.runtime.pausedReason || 'Automations are paused until you start them.');
    }
    if (snapshot && !snapshot.connection.fresh) items.push('Telemetry is stale. New starts stay disabled.');
    return items;
  }, [readings?.pumpBlocked, snapshot]);

  return (
    <>
      {!snapshot ? <Spinner label="Connecting to the local controller…" /> : null}

      {snapshot?.simulation ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Simulation</MessageBarTitle>
            Commands go to a local farm model, not the physical ESP32.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {banners.map((item) => (
        <MessageBar key={item} intent="warning">
          <MessageBarBody>{item}</MessageBarBody>
        </MessageBar>
      ))}

      {error ? (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Command failed</MessageBarTitle>
            {error}
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
          <SensorCard label="Soil moisture" value={formatValue(readings?.soilPct, '%')} />
          <SensorCard
            label="Tank level"
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
          <SensorCard label="Yellow button" value={formatValue(readings?.button)} />
          <SensorCard
            label="Wi-Fi"
            value={formatValue(readings?.rssiDbm, ' dBm')}
            hint={
              snapshot
                ? `${snapshot.connection.transport} · ${snapshot.connection.status} · ${snapshot.connection.ownership}`
                : undefined
            }
          />
        </div>
      </section>

      <section className="section">
        <Title3>Automations</Title3>
        <Text as="p" data-testid="automation-master">
          {snapshot?.automations.runtime.masterEnabled
            ? 'Running on the server. Closing this tab does not pause them.'
            : snapshot?.automations.runtime.pausedReason || 'Paused — start explicitly.'}
        </Text>
        <ul className="rule-list">
          {(['irrigation', 'alarm', 'rain', 'cooling', 'lighting'] as const).map((rule) => (
            <li key={rule}>
              <strong>{rule}</strong>: {snapshot?.automations.runtime.messages[rule] ?? '—'}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <Title3>Controls</Title3>
        <Text as="p" data-testid="control-status">
          {pending.length
            ? `Waiting for the farm to confirm ${pending[0]?.action ?? 'a command'}.`
            : 'Ready for manual commands.'}
        </Text>
        <div className="control-row">
          <Switch
            label="Fan"
            checked={Boolean(readings?.fan)}
            disabled={!canControl}
            onChange={(_, data) => command.mutate({ type: 'fan.set', on: data.checked })}
          />
          <Switch
            label="Light"
            checked={Boolean(readings?.led)}
            disabled={!canControl}
            onChange={(_, data) => command.mutate({ type: 'light.set', on: data.checked })}
          />
          <Switch
            label="Feeder"
            checked={Boolean(readings?.feederOpen)}
            disabled={!canControl}
            onChange={(_, data) => command.mutate({ type: 'feeder.set', open: data.checked })}
          />
          <Switch
            label="Backlight"
            checked={Boolean(readings?.backlight)}
            disabled={!canControl}
            onChange={(_, data) => command.mutate({ type: 'lcd.setBacklight', on: data.checked })}
          />
        </div>
        <Text size={200}>
          Reported fan {formatValue(readings?.fan)}
          {pendingAction('fan.set') ? ' · turning…' : ''} · light {formatValue(readings?.led)}
          {pendingAction('light.set') ? ' · turning…' : ''} · feeder {formatValue(readings?.feederOpen)}
          {pendingAction('feeder.set') ? ' · moving…' : ''} · backlight {formatValue(readings?.backlight)}
          {pendingAction('lcd.setBacklight') ? ' · turning…' : ''}
        </Text>
        <div className="control-row">
          <Button appearance="primary" disabled={!canControl} onClick={() => command.mutate({ type: 'pump.pulse' })}>
            Water briefly
          </Button>
          <Button disabled={!canControl} onClick={() => command.mutate({ type: 'pump.stop' })}>
            Stop pump
          </Button>
          <Button disabled={!canControl} onClick={() => command.mutate({ type: 'buzzer.beep', frequencyHz: 880 })}>
            Beep
          </Button>
          <Button disabled={!canControl} onClick={() => command.mutate({ type: 'buzzer.stop' })}>
            Silence
          </Button>
          <Dialog>
            <DialogTrigger disableButtonEnhancement>
              <Button>LCD text</Button>
            </DialogTrigger>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>Requested LCD text</DialogTitle>
                <DialogContent className="lcd-fields">
                  {alarmOwnsLcd ? (
                    <Text role="status">Saved text is deferred while the tank warning owns the display.</Text>
                  ) : null}
                  {lcdInvalid ? <Text role="alert">Use printable ASCII without the | character.</Text> : null}
                  <label>
                    Line 1 ({lcd1.length}/{LCD_MAX_CHARS})
                    <Input
                      value={lcd1}
                      maxLength={LCD_MAX_CHARS}
                      aria-label="LCD line 1"
                      onChange={(_, data) => setLcd1(data.value)}
                    />
                  </label>
                  <label>
                    Line 2 ({lcd2.length}/{LCD_MAX_CHARS})
                    <Input
                      value={lcd2}
                      maxLength={LCD_MAX_CHARS}
                      aria-label="LCD line 2"
                      onChange={(_, data) => setLcd2(data.value)}
                    />
                  </label>
                  <Text as="pre" className="lcd-preview">
                    {`${lcd1.padEnd(LCD_MAX_CHARS)}\n${lcd2.padEnd(LCD_MAX_CHARS)}`}
                  </Text>
                </DialogContent>
                <DialogActions>
                  <Button disabled={!canControl} onClick={() => command.mutate({ type: 'lcd.showStatus' })}>
                    Restore sensor display
                  </Button>
                  <DialogTrigger disableButtonEnhancement>
                    <Button
                      appearance="primary"
                      disabled={!canControl || lcdInvalid}
                      onClick={() => command.mutate({ type: 'lcd.setText', line1: lcd1, line2: lcd2 })}
                    >
                      Save
                    </Button>
                  </DialogTrigger>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
        <Text as="p" size={200}>
          Pump {formatValue(readings?.pump)}
          {pendingAction('pump.pulse') || pendingAction('pump.stop') ? ' · pending' : ''} · Buzzer{' '}
          {formatValue(readings?.buzzer)}
          {pendingAction('buzzer.beep') || pendingAction('buzzer.stop') ? ' · pending' : ''} · LCD{' '}
          {snapshot ? `${snapshot.lcd.line1} | ${snapshot.lcd.line2}` : '—'}
        </Text>
      </section>
      <section className="section">
        <Title3>Recent activity</Title3>
        <ul className="rule-list">
          {pending.length ? (
            pending.map((row) => (
              <li key={row.id}>
                {row.action} · {row.status}
                {row.reason ? ` · ${row.reason}` : ''}
              </li>
            ))
          ) : (
            <li>No pending commands.</li>
          )}
        </ul>
      </section>
    </>
  );
}
