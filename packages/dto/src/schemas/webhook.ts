import { z } from "zod";
import { uuidSchema } from "./common";
import { appointmentStatusSchema } from "./appointment";

export const webhookSessionResponseSchema = z.object({
  appId: z.string().min(1),
  token: z.string().min(1),
  serverUrl: z.url().optional(),
  expiresInSeconds: z.number().int().positive(),
});
export type WebhookSessionResponse = z.infer<
  typeof webhookSessionResponseSchema
>;

const isoDateTimeStringSchema = z.iso.datetime();

export const webhookEventTypes = [
  "appointment.created",
  "appointment.updated",
  "calendar.created",
  "calendar.updated",
  "calendar.deleted",
  "appointment_type.created",
  "appointment_type.updated",
  "appointment_type.deleted",
  "resource.created",
  "resource.updated",
  "resource.deleted",
  "location.created",
  "location.updated",
  "location.deleted",
  "client.created",
  "client.updated",
  "client.deleted",
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

const appointmentSnapshotSchema = z.object({
  appointmentId: uuidSchema,
  calendarId: uuidSchema,
  appointmentTypeId: uuidSchema,
  clientId: uuidSchema.nullable(),
  startAt: isoDateTimeStringSchema,
  endAt: isoDateTimeStringSchema,
  timezone: z.string().min(1),
  status: appointmentStatusSchema,
  notes: z.string().nullable(),
});

const calendarSnapshotSchema = z.object({
  calendarId: uuidSchema,
  name: z.string().min(1).max(255),
  timezone: z.string().min(1),
  locationId: uuidSchema.nullable(),
});

const appointmentTypeSnapshotSchema = z.object({
  appointmentTypeId: uuidSchema,
  name: z.string().min(1).max(255),
  durationMin: z.number().int().positive(),
  paddingBeforeMin: z.number().int().nonnegative().nullable(),
  paddingAfterMin: z.number().int().nonnegative().nullable(),
  capacity: z.number().int().positive().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

const resourceSnapshotSchema = z.object({
  resourceId: uuidSchema,
  name: z.string().min(1).max(255),
  quantity: z.number().int().positive(),
  locationId: uuidSchema.nullable(),
});

const locationSnapshotSchema = z.object({
  locationId: uuidSchema,
  name: z.string().min(1).max(255),
  timezone: z.string().min(1),
});

const clientSnapshotSchema = z.object({
  clientId: uuidSchema,
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.email().nullable(),
  phone: z.string().max(50).nullable(),
});

export const webhookEventDataSchemaByType = {
  "appointment.created": appointmentSnapshotSchema,
  "appointment.updated": appointmentSnapshotSchema.extend({
    previous: appointmentSnapshotSchema,
  }),
  "calendar.created": calendarSnapshotSchema,
  "calendar.updated": calendarSnapshotSchema.extend({
    previous: calendarSnapshotSchema,
  }),
  "calendar.deleted": calendarSnapshotSchema,
  "appointment_type.created": appointmentTypeSnapshotSchema,
  "appointment_type.updated": appointmentTypeSnapshotSchema.extend({
    previous: appointmentTypeSnapshotSchema,
  }),
  "appointment_type.deleted": appointmentTypeSnapshotSchema,
  "resource.created": resourceSnapshotSchema,
  "resource.updated": resourceSnapshotSchema.extend({
    previous: resourceSnapshotSchema,
  }),
  "resource.deleted": resourceSnapshotSchema,
  "location.created": locationSnapshotSchema,
  "location.updated": locationSnapshotSchema.extend({
    previous: locationSnapshotSchema,
  }),
  "location.deleted": locationSnapshotSchema,
  "client.created": clientSnapshotSchema,
  "client.updated": clientSnapshotSchema.extend({
    previous: clientSnapshotSchema,
  }),
  "client.deleted": clientSnapshotSchema,
} satisfies {
  [TEventType in WebhookEventType]: z.ZodType;
};

export type WebhookEventDataByType = {
  [TEventType in WebhookEventType]: z.output<
    (typeof webhookEventDataSchemaByType)[TEventType]
  >;
};

export type WebhookEventData<TEventType extends WebhookEventType> = z.output<
  (typeof webhookEventDataSchemaByType)[TEventType]
>;

export const webhookEventTypeSchema = z.enum(webhookEventTypes);

const webhookEnvelopeBaseSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  timestamp: isoDateTimeStringSchema,
});

function createWebhookEnvelopeSchema<TEventType extends WebhookEventType>(
  eventType: TEventType,
) {
  return webhookEnvelopeBaseSchema.extend({
    type: z.literal(eventType),
    data: webhookEventDataSchemaByType[eventType],
  });
}

export const webhookEventEnvelopeSchemaByType = {
  "appointment.created": createWebhookEnvelopeSchema("appointment.created"),
  "appointment.updated": createWebhookEnvelopeSchema("appointment.updated"),
  "calendar.created": createWebhookEnvelopeSchema("calendar.created"),
  "calendar.updated": createWebhookEnvelopeSchema("calendar.updated"),
  "calendar.deleted": createWebhookEnvelopeSchema("calendar.deleted"),
  "appointment_type.created": createWebhookEnvelopeSchema(
    "appointment_type.created",
  ),
  "appointment_type.updated": createWebhookEnvelopeSchema(
    "appointment_type.updated",
  ),
  "appointment_type.deleted": createWebhookEnvelopeSchema(
    "appointment_type.deleted",
  ),
  "resource.created": createWebhookEnvelopeSchema("resource.created"),
  "resource.updated": createWebhookEnvelopeSchema("resource.updated"),
  "resource.deleted": createWebhookEnvelopeSchema("resource.deleted"),
  "location.created": createWebhookEnvelopeSchema("location.created"),
  "location.updated": createWebhookEnvelopeSchema("location.updated"),
  "location.deleted": createWebhookEnvelopeSchema("location.deleted"),
  "client.created": createWebhookEnvelopeSchema("client.created"),
  "client.updated": createWebhookEnvelopeSchema("client.updated"),
  "client.deleted": createWebhookEnvelopeSchema("client.deleted"),
} satisfies {
  [TEventType in WebhookEventType]: z.ZodType;
};

export const webhookEventEnvelopeSchema = z.discriminatedUnion("type", [
  webhookEventEnvelopeSchemaByType["appointment.created"],
  webhookEventEnvelopeSchemaByType["appointment.updated"],
  webhookEventEnvelopeSchemaByType["calendar.created"],
  webhookEventEnvelopeSchemaByType["calendar.updated"],
  webhookEventEnvelopeSchemaByType["calendar.deleted"],
  webhookEventEnvelopeSchemaByType["appointment_type.created"],
  webhookEventEnvelopeSchemaByType["appointment_type.updated"],
  webhookEventEnvelopeSchemaByType["appointment_type.deleted"],
  webhookEventEnvelopeSchemaByType["resource.created"],
  webhookEventEnvelopeSchemaByType["resource.updated"],
  webhookEventEnvelopeSchemaByType["resource.deleted"],
  webhookEventEnvelopeSchemaByType["location.created"],
  webhookEventEnvelopeSchemaByType["location.updated"],
  webhookEventEnvelopeSchemaByType["location.deleted"],
  webhookEventEnvelopeSchemaByType["client.created"],
  webhookEventEnvelopeSchemaByType["client.updated"],
  webhookEventEnvelopeSchemaByType["client.deleted"],
]);

export type WebhookEventEnvelope = z.infer<typeof webhookEventEnvelopeSchema>;
