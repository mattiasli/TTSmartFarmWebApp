import { z } from 'zod';

export const AUTOMATION_SCHEMA_VERSION = 1;

export const DEFAULT_AUTOMATIONS = Object.freeze({
  irrigation: true,
  alarm: true,
  rain: true,
  cooling: true,
  lighting: true,
  soilDry: 35,
  cooldown: 30,
  maxPulses: 3,
  tankLow: 20,
  tankRecover: 30,
  beepInterval: 10,
  rainDelay: 10,
  fanOn: 29,
  fanOff: 27,
  lightOn: 1500,
  lightOff: 2000,
  motionOnly: false,
  motionSeconds: 15,
});

export const AUTOMATION_RANGES = Object.freeze({
  soilDry: [1, 99],
  cooldown: [15, 600],
  maxPulses: [1, 10],
  tankLow: [1, 90],
  tankRecover: [2, 100],
  beepInterval: [5, 120],
  rainDelay: [0, 120],
  fanOn: [10, 50],
  fanOff: [0, 49],
  lightOn: [0, 4094],
  lightOff: [1, 4095],
  motionSeconds: [3, 120],
} as const);

export const RULE_IDS = ['irrigation', 'alarm', 'rain', 'cooling', 'lighting'] as const;
export type RuleId = (typeof RULE_IDS)[number];

const intIn = ([min, max]: readonly [number, number]) => z.number().int().min(min).max(max);

export const automationSettingsSchema = z
  .object({
    irrigation: z.boolean(),
    alarm: z.boolean(),
    rain: z.boolean(),
    cooling: z.boolean(),
    lighting: z.boolean(),
    soilDry: intIn(AUTOMATION_RANGES.soilDry),
    cooldown: intIn(AUTOMATION_RANGES.cooldown),
    maxPulses: intIn(AUTOMATION_RANGES.maxPulses),
    tankLow: intIn(AUTOMATION_RANGES.tankLow),
    tankRecover: intIn(AUTOMATION_RANGES.tankRecover),
    beepInterval: intIn(AUTOMATION_RANGES.beepInterval),
    rainDelay: intIn(AUTOMATION_RANGES.rainDelay),
    fanOn: intIn(AUTOMATION_RANGES.fanOn),
    fanOff: intIn(AUTOMATION_RANGES.fanOff),
    lightOn: intIn(AUTOMATION_RANGES.lightOn),
    lightOff: intIn(AUTOMATION_RANGES.lightOff),
    motionOnly: z.boolean(),
    motionSeconds: intIn(AUTOMATION_RANGES.motionSeconds),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.tankRecover <= value.tankLow) {
      ctx.addIssue({
        code: 'custom',
        path: ['tankRecover'],
        message: 'Tank recovery must be above the low-tank threshold.',
      });
    }
    if (value.fanOff >= value.fanOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['fanOff'],
        message: 'Fan off temperature must be below its on temperature.',
      });
    }
    if (value.lightOff <= value.lightOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['lightOff'],
        message: 'Daylight threshold must be above the darkness threshold.',
      });
    }
  });

export type AutomationSettings = z.infer<typeof automationSettingsSchema>;

export type AutomationRuntimeView = {
  masterEnabled: boolean;
  pausedReason: string;
  messages: Record<RuleId, string>;
  manual: RuleId[];
  faults: Partial<Record<RuleId | 'guard', string>>;
  attempts: number;
  cooldownRemainingSeconds: number;
  tankIsLow: boolean;
  guardConfirmed: boolean;
  alarmActive: boolean;
};

export type AutomationReadingsView = {
  temperatureC: number | null;
  humidityPct: number | null;
  dhtHealthy: boolean | null;
  soilPct: number | null;
  waterPct: number | null;
  lightRaw: number | null;
  steamRaw: number | null;
  rain: boolean | null;
  pir: boolean | null;
  pump: boolean | null;
  fan: boolean | null;
  led: boolean | null;
  telemetryAgeMs: number | null;
  fresh: boolean;
};

export type SaveResult = {
  revision: number;
  settings: AutomationSettings;
  guardStatus: 'saved' | 'pending' | 'confirmed' | 'failed';
};
