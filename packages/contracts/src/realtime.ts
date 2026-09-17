import { z } from 'zod';

export const REALTIME_PROTOCOL_VERSION = 1;

export const realtimeTypeSchema = z.enum([
  'snapshot',
  'telemetry',
  'command',
  'automation',
  'connection',
  'event',
]);

export const realtimeEnvelopeSchema = z.object({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  farmId: z.string().uuid(),
  serverEpoch: z.string(),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string(),
  type: realtimeTypeSchema,
  data: z.unknown(),
});

export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

export const farmModeSchema = z.enum(['live', 'simulator']);
export type FarmMode = z.infer<typeof farmModeSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
