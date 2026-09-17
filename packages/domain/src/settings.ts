import {
  AUTOMATION_RANGES,
  DEFAULT_AUTOMATIONS,
  automationSettingsSchema,
  type AutomationSettings,
} from '@smartfarm/contracts';

export function validateAutomations(input: unknown): AutomationSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid automation settings.');
  }
  const result: Record<string, unknown> = { ...DEFAULT_AUTOMATIONS };
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Object.hasOwn(result, key)) throw new Error(`Unknown setting: ${key}`);
    result[key] = value;
  }
  const parsed = automationSettingsSchema.safeParse(result);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = issue?.path[0] ? String(issue.path[0]) : 'settings';
    if (key === 'tankRecover') throw new Error('Tank recovery must be above the low-tank threshold.');
    if (key === 'fanOff') throw new Error('Fan off temperature must be below its on temperature.');
    if (key === 'lightOff') throw new Error('Daylight threshold must be above the darkness threshold.');
    throw new Error(issue?.message ?? `Invalid value for ${key}.`);
  }
  return parsed.data;
}

export function editAutomationSetting(
  settings: AutomationSettings,
  key: keyof AutomationSettings,
  value: AutomationSettings[keyof AutomationSettings],
): AutomationSettings {
  const next = { ...settings, [key]: value };
  const gap = settings.fanOn - settings.fanOff;
  if (key === 'fanOn' && typeof value === 'number' && value <= settings.fanOff) {
    next.fanOff = Math.max(AUTOMATION_RANGES.fanOff[0], value - gap);
  } else if (key === 'fanOff' && typeof value === 'number' && value >= settings.fanOn) {
    next.fanOn = Math.min(AUTOMATION_RANGES.fanOn[1], value + gap);
  } else if (key === 'lightOn' && typeof value === 'number' && value >= settings.lightOff) {
    next.lightOff = Math.min(
      AUTOMATION_RANGES.lightOff[1],
      value + settings.lightOff - settings.lightOn,
    );
  } else if (key === 'lightOff' && typeof value === 'number' && value <= settings.lightOn) {
    next.lightOn = Math.max(
      AUTOMATION_RANGES.lightOn[0],
      value - (settings.lightOff - settings.lightOn),
    );
  }
  return validateAutomations(next);
}
