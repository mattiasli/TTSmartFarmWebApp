import { DEFAULT_AUTOMATIONS } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyDraftNumber,
  assertCompatibleContract,
  classifyLighting,
  draftCanApply,
  isStaleSaveResponse,
  nextDraftFromServer,
  parseDraftNumber,
} from './draft';

describe('automation draft helpers', () => {
  it('T051 keeps an empty number incomplete instead of snapping the draft', () => {
    expect(parseDraftNumber('')).toEqual({ status: 'empty' });
    expect(parseDraftNumber('   ')).toEqual({ status: 'empty' });
    expect(draftCanApply(DEFAULT_AUTOMATIONS, {}, true)).toBe(false);
  });

  it('T051/T054 moves the companion fan threshold when values cross', () => {
    const edited = applyDraftNumber(DEFAULT_AUTOMATIONS, 'fanOn', 26);
    expect(edited.settings.fanOn).toBe(26);
    expect(edited.settings.fanOff).toBe(24);
    expect(edited.fieldErrors).toEqual({});
  });

  it('keeps an invalid tank pair editable and blocks Apply', () => {
    const edited = applyDraftNumber(DEFAULT_AUTOMATIONS, 'tankLow', 40);
    expect(edited.settings.tankLow).toBe(40);
    expect(edited.settings.tankRecover).toBe(30);
    expect(edited.fieldErrors.tankRecover).toMatch(/recovery must be above/);
    expect(draftCanApply(edited.settings, edited.fieldErrors, false)).toBe(false);
  });

  it('T055 classifies 2559 as dark against 3380/3560 without waiting for another packet', () => {
    expect(classifyLighting(2559, 3380, 3560)).toBe('dark');
    expect(classifyLighting(3500, 3380, 3560, 'dark')).toBe('dark');
    expect(classifyLighting(3600, 3380, 3560, 'dark')).toBe('day');
  });

  it('moves the companion lighting threshold when values cross', () => {
    const edited = applyDraftNumber(DEFAULT_AUTOMATIONS, 'lightOn', 2500);
    expect(edited.settings.lightOn).toBe(2500);
    expect(edited.settings.lightOff).toBeGreaterThan(2500);
    expect(edited.fieldErrors).toEqual({});
  });

  it('clears tank pair errors once recovery is above low', () => {
    const invalid = applyDraftNumber(DEFAULT_AUTOMATIONS, 'tankLow', 40);
    expect(draftCanApply(invalid.settings, invalid.fieldErrors, false)).toBe(false);
    const valid = applyDraftNumber(invalid.settings, 'tankRecover', 50);
    expect(valid.fieldErrors).toEqual({});
    expect(draftCanApply(valid.settings, valid.fieldErrors, false)).toBe(true);
  });

  it('T059 preserves a dirty draft when telemetry-driven settings stay at the same revision', () => {
    const draft = { ...DEFAULT_AUTOMATIONS, soilDry: 40 };
    const next = nextDraftFromServer({
      dirty: true,
      draft,
      server: DEFAULT_AUTOMATIONS,
      previousRevision: 3,
      nextRevision: 3,
    });
    expect(next.draft.soilDry).toBe(40);
    expect(next.conflict).toBe(false);
  });

  it('T059/T062 flags a concurrent revision and ignores a stale save response', () => {
    const draft = { ...DEFAULT_AUTOMATIONS, soilDry: 40 };
    const next = nextDraftFromServer({
      dirty: true,
      draft,
      server: { ...DEFAULT_AUTOMATIONS, soilDry: 42 },
      previousRevision: 3,
      nextRevision: 4,
    });
    expect(next.draft.soilDry).toBe(40);
    expect(next.conflict).toBe(true);
    expect(next.acceptRevision).toBe(false);
    expect(isStaleSaveResponse(3, 4)).toBe(true);
    expect(isStaleSaveResponse(4, 4)).toBe(false);
  });

  it('T086 rejects an incompatible contract major before render', () => {
    expect(() => assertCompatibleContract({ contractVersion: 1 })).not.toThrow();
    expect(() => assertCompatibleContract(undefined)).not.toThrow();
    expect(() => assertCompatibleContract({ contractVersion: 2 })).toThrow(/contract 2 is not supported/);
  });
});
