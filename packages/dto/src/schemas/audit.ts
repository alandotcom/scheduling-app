import { z } from 'zod'
import { uuidSchema, timestampsSchema, dateSchema } from './common'

// Audit action enum
export const auditActionSchema = z.enum(['create', 'update', 'delete', 'cancel', 'reschedule', 'no_show'])

// Audit actor type enum
export const auditActorTypeSchema = z.enum(['user', 'api_token', 'system'])

// Audit entity type enum
export const auditEntityTypeSchema = z.enum([
  'appointment',
  'calendar',
  'location',
  'resource',
  'appointment_type',
  'client',
])

// Base audit event schema
export const auditEventSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  actorId: uuidSchema.nullable(),
  actorType: auditActorTypeSchema,
  action: auditActionSchema,
  entityType: auditEntityTypeSchema,
  entityId: uuidSchema,
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
})

// List audit events query
export const listAuditEventsQuerySchema = z.object({
  entityType: auditEntityTypeSchema.optional(),
  entityId: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  action: auditActionSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

// Response with optional actor relation
export const auditEventResponseSchema = auditEventSchema.extend({
  actor: z.object({
    id: uuidSchema,
    name: z.string().nullable(),
    email: z.string(),
  }).optional().nullable(),
})

// Inferred types
export type AuditAction = z.infer<typeof auditActionSchema>
export type AuditActorType = z.infer<typeof auditActorTypeSchema>
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>
export type AuditEvent = z.infer<typeof auditEventSchema>
export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>
export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>
