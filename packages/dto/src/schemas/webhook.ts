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
  "appointment.cancelled",
  "appointment.rescheduled",
  "appointment.no_show",
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

const appointmentUpdateChangesSchema = z.object({
  clientId: uuidSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

const calendarUpdateChangesSchema = z.object({
  locationId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().min(1).optional(),
});

const appointmentTypeUpdateChangesSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  durationMin: z.number().int().positive().optional(),
  paddingBeforeMin: z.number().int().nonnegative().nullable().optional(),
  paddingAfterMin: z.number().int().nonnegative().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const resourceUpdateChangesSchema = z.object({
  locationId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  quantity: z.number().int().positive().optional(),
});

const locationUpdateChangesSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().min(1).optional(),
});

const clientUpdateChangesSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});

export const webhookEventDataSchemaByType = {
  "appointment.created": z.object({
    appointmentId: uuidSchema,
    calendarId: uuidSchema,
    appointmentTypeId: uuidSchema,
    clientId: uuidSchema.nullable(),
    startAt: isoDateTimeStringSchema,
    endAt: isoDateTimeStringSchema,
    timezone: z.string().min(1),
    status: appointmentStatusSchema,
  }),
  "appointment.updated": z.object({
    appointmentId: uuidSchema,
    changes: appointmentUpdateChangesSchema,
    previousClientId: uuidSchema.nullable(),
    previousNotes: z.string().nullable(),
  }),
  "appointment.cancelled": z.object({
    appointmentId: uuidSchema,
    calendarId: uuidSchema,
    appointmentTypeId: uuidSchema,
    clientId: uuidSchema.nullable(),
    startAt: isoDateTimeStringSchema,
    endAt: isoDateTimeStringSchema,
    reason: z.string().optional(),
  }),
  "appointment.rescheduled": z.object({
    appointmentId: uuidSchema,
    calendarId: uuidSchema,
    appointmentTypeId: uuidSchema,
    clientId: uuidSchema.nullable(),
    previousStartAt: isoDateTimeStringSchema,
    previousEndAt: isoDateTimeStringSchema,
    newStartAt: isoDateTimeStringSchema,
    newEndAt: isoDateTimeStringSchema,
    timezone: z.string().min(1),
  }),
  "appointment.no_show": z.object({
    appointmentId: uuidSchema,
    calendarId: uuidSchema,
    appointmentTypeId: uuidSchema,
    clientId: uuidSchema.nullable(),
    startAt: isoDateTimeStringSchema,
    endAt: isoDateTimeStringSchema,
  }),
  "calendar.created": z.object({
    calendarId: uuidSchema,
    name: z.string().min(1).max(255),
    timezone: z.string().min(1),
    locationId: uuidSchema.nullable(),
  }),
  "calendar.updated": z.object({
    calendarId: uuidSchema,
    changes: calendarUpdateChangesSchema,
    previous: z.object({
      name: z.string().min(1).max(255),
      timezone: z.string().min(1),
      locationId: uuidSchema.nullable(),
    }),
  }),
  "calendar.deleted": z.object({
    calendarId: uuidSchema,
    name: z.string().min(1).max(255),
    timezone: z.string().min(1),
    locationId: uuidSchema.nullable(),
  }),
  "appointment_type.created": z.object({
    appointmentTypeId: uuidSchema,
    name: z.string().min(1).max(255),
    durationMin: z.number().int().positive(),
    paddingBeforeMin: z.number().int().nonnegative().nullable(),
    paddingAfterMin: z.number().int().nonnegative().nullable(),
    capacity: z.number().int().positive().nullable(),
  }),
  "appointment_type.updated": z.object({
    appointmentTypeId: uuidSchema,
    changes: appointmentTypeUpdateChangesSchema,
    previous: z.object({
      name: z.string().min(1).max(255),
      durationMin: z.number().int().positive(),
      paddingBeforeMin: z.number().int().nonnegative().nullable(),
      paddingAfterMin: z.number().int().nonnegative().nullable(),
      capacity: z.number().int().positive().nullable(),
    }),
  }),
  "appointment_type.deleted": z.object({
    appointmentTypeId: uuidSchema,
    name: z.string().min(1).max(255),
    durationMin: z.number().int().positive(),
  }),
  "resource.created": z.object({
    resourceId: uuidSchema,
    name: z.string().min(1).max(255),
    quantity: z.number().int().positive(),
    locationId: uuidSchema.nullable(),
  }),
  "resource.updated": z.object({
    resourceId: uuidSchema,
    changes: resourceUpdateChangesSchema,
    previous: z.object({
      name: z.string().min(1).max(255),
      quantity: z.number().int().positive(),
      locationId: uuidSchema.nullable(),
    }),
  }),
  "resource.deleted": z.object({
    resourceId: uuidSchema,
    name: z.string().min(1).max(255),
    quantity: z.number().int().positive(),
    locationId: uuidSchema.nullable(),
  }),
  "location.created": z.object({
    locationId: uuidSchema,
    name: z.string().min(1).max(255),
    timezone: z.string().min(1),
  }),
  "location.updated": z.object({
    locationId: uuidSchema,
    changes: locationUpdateChangesSchema,
    previous: z.object({
      name: z.string().min(1).max(255),
      timezone: z.string().min(1),
    }),
  }),
  "location.deleted": z.object({
    locationId: uuidSchema,
    name: z.string().min(1).max(255),
    timezone: z.string().min(1),
  }),
  "client.created": z.object({
    clientId: uuidSchema,
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    email: z.email().nullable(),
  }),
  "client.updated": z.object({
    clientId: uuidSchema,
    changes: clientUpdateChangesSchema,
    previous: z.object({
      firstName: z.string().min(1).max(255),
      lastName: z.string().min(1).max(255),
      email: z.email().nullable(),
      phone: z.string().max(50).nullable(),
    }),
  }),
  "client.deleted": z.object({
    clientId: uuidSchema,
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    email: z.email().nullable(),
  }),
} satisfies {
  [TEventType in WebhookEventType]: z.ZodType;
};

export type WebhookEventDataByType = {
  [TEventType in WebhookEventType]: z.output<
    (typeof webhookEventDataSchemaByType)[TEventType]
  >;
};

export type WebhookEventData<TEventType extends WebhookEventType> =
  z.output<(typeof webhookEventDataSchemaByType)[TEventType]>;

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
  "appointment.cancelled": createWebhookEnvelopeSchema("appointment.cancelled"),
  "appointment.rescheduled": createWebhookEnvelopeSchema(
    "appointment.rescheduled",
  ),
  "appointment.no_show": createWebhookEnvelopeSchema("appointment.no_show"),
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
  webhookEventEnvelopeSchemaByType["appointment.cancelled"],
  webhookEventEnvelopeSchemaByType["appointment.rescheduled"],
  webhookEventEnvelopeSchemaByType["appointment.no_show"],
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
