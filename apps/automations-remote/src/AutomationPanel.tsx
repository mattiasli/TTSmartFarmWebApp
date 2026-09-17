import {
  Button,
  Card,
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
import { editAutomationSetting } from '@smartfarm/domain';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revisionRef = useRef<number | undefined>(props.settingsRevision);
  const dirty = useMemo(() => !sameSettings(draft, settings), [draft, settings]);

  useEffect(() => {
    if (!props.settings || props.settingsRevision == null) return;
    if (revisionRef.current === props.settingsRevision) return;
    revisionRef.current = props.settingsRevision;
    setDraft((current) => (dirty ? current : (props.settings ?? current)));
  }, [props.settings, props.settingsRevision, dirty]);
  const canEdit = props.permissions?.canEdit !== false;

  function setNumber(key: FieldKey, raw: number) {
    try {
      setDraft(editAutomationSetting(draft, key, raw));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid value.');
    }
  }

  async function apply() {
    if (!props.onSave || props.settingsRevision == null) {
      setError('The host has not provided a save callback.');
      return;
    }
    setBusy(true);
    try {
      const result = await props.onSave(draft, props.settingsRevision);
      revisionRef.current = result.revision;
      setDraft(result.settings);
      setError(null);
      props.onNotify?.('Remote dialog used a React hook and notified the host.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="automation-editor">
      {props.settings ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Title3>Thresholds</Title3>
            <Button appearance="primary" disabled={!dirty || !canEdit || busy} onClick={() => void apply()}>
              Apply
            </Button>
            <Button
              disabled={!dirty || busy}
              onClick={() => {
                setDraft(settings);
                setError(null);
              }}
            >
              Cancel
            </Button>
            {dirty ? <Text>Unsaved edits — Apply to send them to the server.</Text> : null}
          </div>
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
                    disabled={!canEdit}
                    label="On"
                    onChange={(_, data) => setDraft({ ...draft, [card.rule]: data.checked })}
                  />
                </div>
                <Text>{card.description}</Text>
                <Text weight="semibold">{props.runtime?.messages[card.rule] ?? 'Paused'}</Text>
                {card.fields.map((field) => {
                  const [min, max] = rangeFor(field.key);
                  const value = Number(draft[field.key]);
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
                        disabled={!canEdit}
                        onChange={(_, data) => setNumber(field.key, data.value)}
                      />
                    </label>
                  );
                })}
                {card.motionOnly ? (
                  <Switch
                    checked={draft.motionOnly}
                    disabled={!canEdit}
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
