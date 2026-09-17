import { z } from 'zod';

export const LCD_MAX_CHARS = 16;
const LCD_CHAR = /^[\x20-\x7b\x7d-\x7e]*$/;

export const lcdLineSchema = z
  .string()
  .max(LCD_MAX_CHARS)
  .regex(LCD_CHAR, 'LCD text must be printable ASCII without the | character.');

export const farmCommandRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fan.set'), on: z.boolean() }).strict(),
  z.object({ type: z.literal('light.set'), on: z.boolean() }).strict(),
  z.object({ type: z.literal('pump.pulse') }).strict(),
  z.object({ type: z.literal('pump.stop') }).strict(),
  z.object({ type: z.literal('buzzer.beep'), frequencyHz: z.number().int().min(40).max(10_000) }).strict(),
  z.object({ type: z.literal('buzzer.stop') }).strict(),
  z.object({ type: z.literal('feeder.set'), open: z.boolean() }).strict(),
  z.object({ type: z.literal('lcd.setText'), line1: lcdLineSchema, line2: lcdLineSchema }).strict(),
  z.object({ type: z.literal('lcd.showStatus') }).strict(),
  z.object({ type: z.literal('lcd.setBacklight'), on: z.boolean() }).strict(),
  z.object({ type: z.literal('farm.allOff') }).strict(),
]);

export type FarmCommandRequest = z.infer<typeof farmCommandRequestSchema>;

export const commandStatusSchema = z.enum([
  'accepted',
  'publishing',
  'sent',
  'state_matched',
  'failed',
  'uncertain',
  'superseded',
  'rejected',
]);

export type CommandStatus = z.infer<typeof commandStatusSchema>;

export const confirmationModeSchema = z.enum(['state_match', 'not_reported', 'pulse_observation']);
export type ConfirmationMode = z.infer<typeof confirmationModeSchema>;

export type MqttCommand = {
  control: string;
  topic: string;
  payload: string;
};

export type CommandDto = {
  id: string;
  action: FarmCommandRequest['type'];
  status: CommandStatus;
  confirmationMode: ConfirmationMode;
  requestedAt: string;
  sentAt: string | null;
  stateMatchedAt: string | null;
  reason: string | null;
};
