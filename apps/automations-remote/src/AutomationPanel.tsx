import {
  Button,
  Card,
  Input,
  Slider,
  Switch,
  Text,
  Title3,
} from '@fluentui/react-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AUTOMATIONS,
  type AutomationPanelPropsV1,
  type AutomationSettings,
} from '@smartfarm/contracts';
import {
  applyDraftNumber,
  classifyLighting,
  draftCanApply,
  nextDraftFromServer,
  parseDraftNumber,
  type NumericAutomationKey,
} from '@smartfarm/domain';
import { CARDS, rangeFor, type FieldKey } from './cards';
import { FederationProbe } from './FederationProbe';

type Props = Partial<AutomationPanelPropsV1> & {
  onNotify?: (message: string) => void;
};

function sameSettings(a: AutomationSettings, b: AutomationSettings) {
  return (Object.keys(a) as (keyof AutomationSettings)[]).every((key) => a[key] === b[key]);
}

export function AutomationPanel(props: Props) {
  const settings = props.settings ?? DEFAULT_AUTOMATIONS;
  const [draft, setDraft] = useState<AutomationSettings>(settings);
  const [baseline, setBaseline] = useState<AutomationSettings>(settings);
  const [texts, setTexts] = useState<Partial<Record<FieldKey, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<NumericAutomationKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const revisionRef = useRef<number | undefined>(props.settingsRevision);
  const latestRevisionRef = useRef<number | undefined>(props.settingsRevision);
  // Incoming settings are not the draft's baseline until explicitly accepted.
  const dirty = useMemo(
    () => !sameSettings(draft, baseline) || Object.keys(texts).length > 0 || Object.values(fieldErrors).some(Boolean),
    [draft, baseline, texts, fieldErrors],
  );
  const incomplete = Object.values(texts).some((value) => value === '');
  const canEdit = props.permissions?.canEdit !== false;
  const canApply = canEdit && dirty && !busy && draftCanApply(draft, fieldErrors, incomplete);

  useEffect(() => {
    latestRevisionRef.current = props.settingsRevision;
  }, [props.settingsRevision]);

  useEffect(() => {
    if (!props.settings || props.settingsRevision == null) return;
    const next = nextDraftFromServer({
      dirty,
      draft,
      server: props.settings,
      previousRevision: revisionRef.current,
      nextRevision: props.settingsRevision,
    });
    if (next.acceptRevision) {
      revisionRef.current = props.settingsRevision;
      setBaseline(props.settings);
      setDraft(next.draft);
      setTexts({});
      setFieldErrors({});
      setConflict(false);
      return;
    }
    if (next.conflict) setConflict(true);
  }, [props.settings, props.settingsRevision, dirty, draft]);

  function commitNumber(key: FieldKey, value: number) {
    const edited = applyDraftNumber(draft, key, value);
    setDraft(edited.settings);
    setFieldErrors(edited.fieldErrors);
    setTexts((current) => {
      const next = { ...current };
      delete next[key];
      if (edited.settings.fanOff !== draft.fanOff) delete next.fanOff;
      if (edited.settings.fanOn !== draft.fanOn) delete next.fanOn;
      if (edited.settings.lightOff !== draft.lightOff) delete next.lightOff;
      if (edited.settings.lightOn !== draft.lightOn) delete next.lightOn;
      return next;
    });
    setError(null);
  }

  function onNumberText(key: FieldKey, raw: string) {
    setTexts((current) => ({ ...current, [key]: raw }));
    const parsed = parseDraftNumber(raw);
    if (parsed.status === 'empty') {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
      return;
    }
    if (parsed.status === 'invalid') {
      setFieldErrors((current) => ({ ...current, [key]: parsed.message }));
      return;
    }
    commitNumber(key, parsed.value);
  }

  async function apply() {
    if (!props.onSave || props.settingsRevision == null || !canApply) {
      setError(canEdit ? 'Fix the highlighted fields before applying.' : 'Viewers cannot change automations.');
      return;
    }
    const startedRevision = props.settingsRevision;
    setBusy(true);
    try {
      const result = await props.onSave(draft, startedRevision);
      // A socket can announce our own saved revision before HTTP completes.
      if ((latestRevisionRef.current ?? startedRevision) > result.revision) {
        return;
      }
      revisionRef.current = result.revision;
      setBaseline(result.settings);
      setDraft(result.settings);
      setTexts({});
      setFieldErrors({});
      setConflict(false);
      setError(null);
      props.onNotify?.('Remote dialog used a React hook and notified the host.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save settings.';
      setError(/revision|conflict|409/i.test(message) ? 'Settings changed elsewhere. Reload or review your draft.' : message);
      if (/revision|conflict|409/i.test(message)) setConflict(true);
    } finally {
      setBusy(false);
    }
  }

  function reloadServer() {
    if (!props.settings) return;
    setDraft(props.settings);
    setBaseline(props.settings);
    revisionRef.current = props.settingsRevision;
    setTexts({});
    setFieldErrors({});
    setConflict(false);
    setError(null);
  }

  return (
    <div data-testid="automation-editor">
      {props.settings ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Title3>Thresholds</Title3>
            <Button appearance="primary" disabled={!canApply} onClick={() => void apply()}>
              Apply
            </Button>
            <Button
              disabled={(!dirty && !conflict) || busy}
              onClick={reloadServer}
            >
              Cancel
            </Button>
            {dirty ? <Text>Unsaved edits — Apply to send them to the server.</Text> : null}
          </div>
          {props.runtime && !props.runtime.masterEnabled ? (
            <Text role="status" data-testid="editor-master-paused">
              Automations are paused on the server. Rule toggles here do not start them.
            </Text>
          ) : null}
          {conflict ? (
            <Text role="alert" data-testid="settings-conflict">
              Settings changed elsewhere. Reload the saved values or review your draft and Apply again.
              <Button size="small" onClick={reloadServer}>
                Reload saved settings
              </Button>
            </Text>
          ) : null}
          {error ? (
            <Text role="alert" style={{ color: '#c50f1f' }}>
              {error}
            </Text>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
              marginTop: 12,
            }}
          >
            {CARDS.map((card) => (
              <Card key={card.rule} style={{ padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Title3>{card.title}</Title3>
                  <Switch
                    checked={Boolean(draft[card.rule])}
                    disabled={!canEdit || busy}
                    label={draft[card.rule] ? 'On' : 'Off'}
                    aria-label={card.title}
                    onChange={(_, data) => setDraft({ ...draft, [card.rule]: data.checked })}
                  />
                </div>
                <Text>{card.description}</Text>
                <Text weight="semibold">{props.runtime?.messages[card.rule] ?? 'Paused'}</Text>
                <CardReadings card={card.rule} readings={props.readings} draft={draft} runtime={props.runtime} />
                {card.fields.map((field) => {
                  const [min, max] = rangeFor(field.key);
                  const value = Number(draft[field.key]);
                  const text = texts[field.key];
                  return (
                    <label key={field.key} style={{ display: 'grid', gap: 4 }}>
                      <Text>
                        {field.label} ({value}
                        {field.unit})
                      </Text>
                      <Slider
                        min={min}
                        max={max}
                        value={value}
                        disabled={!canEdit || busy}
                        aria-label={field.label}
                        onChange={(_, data) => commitNumber(field.key, data.value)}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={text ?? String(value)}
                        disabled={!canEdit || busy}
                        aria-label={`${field.label} number`}
                        onChange={(_, data) => onNumberText(field.key, data.value)}
                      />
                      {fieldErrors[field.key] ? (
                        <Text role="alert" size={200}>
                          {fieldErrors[field.key]}
                        </Text>
                      ) : null}
                    </label>
                  );
                })}
                {card.motionOnly ? (
                  <Switch
                    checked={draft.motionOnly}
                    disabled={!canEdit || busy}
                    label="Only light up for motion at night"
                    onChange={(_, data) => setDraft({ ...draft, motionOnly: data.checked })}
                  />
                ) : null}
                {props.runtime?.manual.includes(card.rule) || props.runtime?.faults[card.rule] ? (
                  <Button
                    disabled={!props.permissions?.canResume || busy}
                    onClick={() => void props.onResumeRule?.(card.rule)}
                  >
                    Resume automatic
                  </Button>
                ) : null}
                {card.rule === 'irrigation' ? (
                  <Button disabled={!canEdit || busy} onClick={() => void props.onResetIrrigation?.()}>
                    Reset watering attempts
                  </Button>
                ) : null}
                {card.rule === 'alarm' ? (
                  <Button
                    disabled={!canEdit || busy}
                    onClick={() => void props.onSyncGuard?.(props.settingsRevision ?? 0)}
                  >
                    Sync tank protection
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Text>Waiting for farm settings from the host. Pause and All off stay on the dashboard.</Text>
      )}
      <FederationProbe onNotify={props.onNotify} />
    </div>
  );
}

function CardReadings({
  card,
  readings,
  draft,
  runtime,
}: {
  card: (typeof CARDS)[number]['rule'];
  readings: Props['readings'];
  draft: AutomationSettings;
  runtime: Props['runtime'];
}) {
  if (!readings) return null;
  if (card === 'irrigation') {
    return (
      <Text size={200}>
        Soil {readings.soilPct ?? 'unavailable'}% · pump {readings.pump == null ? 'unknown' : readings.pump ? 'on' : 'off'}
      </Text>
    );
  }
  if (card === 'alarm') {
    return (
      <Text size={200}>
        Tank {readings.waterPct ?? 'unavailable'}% · guard {runtime?.guardConfirmed ? 'confirmed' : 'pending'}
        {runtime?.alarmActive ? ' · warning owns the LCD' : ''}
      </Text>
    );
  }
  if (card === 'rain') {
    return (
      <Text size={200}>
        {readings.rain == null ? 'Rain unknown' : readings.rain ? 'Rain detected' : 'Dry'}
        {readings.steamRaw == null ? '' : ` · plate ${readings.steamRaw}`}
      </Text>
    );
  }
  if (card === 'cooling') {
    return (
      <Text size={200}>
        {readings.dhtHealthy === false
          ? 'DHT11 unavailable — cooling waits for a valid temperature.'
          : `Temperature ${readings.temperatureC ?? 'unavailable'}°C`}
      </Text>
    );
  }
  const lighting =
    readings.lightRaw == null ? null : classifyLighting(readings.lightRaw, draft.lightOn, draft.lightOff);
  return (
    <Text size={200} data-testid="lighting-class">
      Roof light {readings.lightRaw ?? 'unavailable'} · {lighting ?? 'unknown'}
      {readings.pir ? ' · motion' : ''}
    </Text>
  );
}
