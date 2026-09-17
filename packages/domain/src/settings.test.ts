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
});
