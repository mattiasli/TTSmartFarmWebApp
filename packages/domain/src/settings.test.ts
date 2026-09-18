import { DEFAULT_AUTOMATIONS } from '@smartfarm/contracts';
import { describe, expect, it } from 'vitest';
import { editAutomationSetting, validateAutomations } from './settings';

describe('automation settings', () => {
  it('rejects unknown keys', () => {
    expect(() => validateAutomations({ ...DEFAULT_AUTOMATIONS, extra: true })).toThrow(/Unknown setting/);
  });

  it('moves the companion cooling threshold when values cross', () => {
    const edited = editAutomationSetting(DEFAULT_AUTOMATIONS, 'fanOn', 26);
    expect(edited.fanOn).toBe(26);
    expect(edited.fanOff).toBe(24);
  });

  it('T051/T054 rejects a temporarily empty number instead of snapping back', () => {
    expect(() => editAutomationSetting(DEFAULT_AUTOMATIONS, 'fanOn', '' as never)).toThrow();
    expect(() => editAutomationSetting(DEFAULT_AUTOMATIONS, 'fanOn', Number.NaN as never)).toThrow();
  });
});
