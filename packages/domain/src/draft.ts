import {
  AUTOMATION_RANGES,
  FEDERATION_CONTRACT_MAJOR,
  type AutomationSettings,
} from '@smartfarm/contracts';
import { editAutomationSetting, validateAutomations } from './settings';

export type NumericAutomationKey = {
  [K in keyof AutomationSettings]: AutomationSettings[K] extends number ? K : never;
}[keyof AutomationSettings];

export type DraftNumberParse =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'value'; value: number };

export type DraftEditResult = {
  settings: AutomationSettings;
  fieldErrors: Partial<Record<NumericAutomationKey, string>>;
};

const COMPANION_KEYS = new Set<NumericAutomationKey>(['fanOn', 'fanOff', 'lightOn', 'lightOff']);

export function parseDraftNumber(raw: string): DraftNumberParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'empty' };
  if (!/^-?\d+$/.test(trimmed)) {
    return { status: 'invalid', message: 'Enter a whole number.' };
  }
  return { status: 'value', value: Number(trimmed) };
}

export function tankPairError(settings: Pick<AutomationSettings, 'tankLow' | 'tankRecover'>): string | null {
  if (settings.tankRecover <= settings.tankLow) {
    return 'Tank recovery must be above the low-tank threshold.';
  }
  return null;
}

export function fieldErrorsFor(settings: AutomationSettings): DraftEditResult['fieldErrors'] {
  const fieldErrors: DraftEditResult['fieldErrors'] = {};
  for (const key of Object.keys(AUTOMATION_RANGES) as NumericAutomationKey[]) {
    const value = settings[key];
    const [min, max] = AUTOMATION_RANGES[key];
    if (value < min || value > max) {
      fieldErrors[key] = `Must be between ${min} and ${max}.`;
    }
  }
  const tank = tankPairError(settings);
  if (tank) {
    fieldErrors.tankLow = tank;
    fieldErrors.tankRecover = tank;
  }
  return fieldErrors;
}

export function applyDraftNumber(
  settings: AutomationSettings,
  key: NumericAutomationKey,
  value: number,
): DraftEditResult {
  if (COMPANION_KEYS.has(key)) {
    try {
      const next = editAutomationSetting(settings, key, value);
      return { settings: next, fieldErrors: fieldErrorsFor(next) };
    } catch (error) {
      return {
        settings,
        fieldErrors: {
          ...fieldErrorsFor(settings),
          [key]: error instanceof Error ? error.message : 'Invalid value.',
        },
      };
    }
  }
  const next = { ...settings, [key]: value };
  return { settings: next, fieldErrors: fieldErrorsFor(next) };
}

export function draftCanApply(
  settings: AutomationSettings,
  fieldErrors: DraftEditResult['fieldErrors'],
  incomplete: boolean,
): boolean {
  if (incomplete) return false;
  if (Object.values(fieldErrors).some(Boolean)) return false;
  try {
    validateAutomations(settings);
    return true;
  } catch {
    return false;
  }
}

export function nextDraftFromServer(input: {
  dirty: boolean;
  draft: AutomationSettings;
  server: AutomationSettings;
  previousRevision: number | undefined;
  nextRevision: number;
}): { draft: AutomationSettings; conflict: boolean; acceptRevision: boolean } {
  if (input.previousRevision === input.nextRevision) {
    return { draft: input.draft, conflict: false, acceptRevision: false };
  }
  if (input.dirty) {
    return { draft: input.draft, conflict: true, acceptRevision: false };
  }
  return { draft: input.server, conflict: false, acceptRevision: true };
}

export function isStaleSaveResponse(startedRevision: number, latestKnownRevision: number): boolean {
  return latestKnownRevision !== startedRevision;
}

export function classifyLighting(
  light: number,
  lightOn: number,
  lightOff: number,
  previous: 'dark' | 'day' = 'day',
): 'dark' | 'day' {
  if (light <= lightOn) return 'dark';
  if (light >= lightOff) return 'day';
  return previous;
}

export function assertCompatibleContract(meta?: { contractVersion: number } | null) {
  if (!meta) return;
  if (meta.contractVersion !== FEDERATION_CONTRACT_MAJOR) {
    throw new Error(`Automation editor contract ${meta.contractVersion} is not supported.`);
  }
}
