import { z } from "zod";
import { uuidSchema } from "./common";

export const assistantClientTableRowSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  appointmentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const assistantAppointmentTableRowSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema,
  clientName: z.string(),
  calendarId: uuidSchema.nullable(),
  appointmentTypeId: uuidSchema.nullable(),
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string(),
  status: z.enum(["scheduled", "confirmed", "cancelled", "no_show"]),
  calendarName: z.string().nullable(),
  appointmentTypeName: z.string().nullable(),
});

export const assistantBookProposalPayloadSchema = z.object({
  calendarId: uuidSchema,
  appointmentTypeId: uuidSchema,
  startTime: z.string(),
  timezone: z.string(),
  clientId: uuidSchema,
  notes: z.string().nullable().optional(),
  clientName: z.string().optional(),
  calendarName: z.string().optional(),
  appointmentTypeName: z.string().optional(),
});

export const assistantRescheduleProposalPayloadSchema = z.object({
  appointmentId: uuidSchema,
  newStartTime: z.string(),
  timezone: z.string(),
  clientName: z.string().optional(),
  calendarName: z.string().optional(),
  appointmentTypeName: z.string().optional(),
  currentStartTime: z.string().optional(),
});

export const assistantConfirmProposalPayloadSchema = z.object({
  appointmentId: uuidSchema,
  clientName: z.string().optional(),
  calendarName: z.string().optional(),
  appointmentTypeName: z.string().optional(),
  startTime: z.string().optional(),
});

export const assistantCancelProposalPayloadSchema = z.object({
  appointmentId: uuidSchema,
  reason: z.string().nullable().optional(),
  clientName: z.string().optional(),
  calendarName: z.string().optional(),
  appointmentTypeName: z.string().optional(),
  startTime: z.string().optional(),
});

export const assistantNoShowProposalPayloadSchema = z.object({
  appointmentId: uuidSchema,
  clientName: z.string().optional(),
  calendarName: z.string().optional(),
  appointmentTypeName: z.string().optional(),
  startTime: z.string().optional(),
});

export const assistantProposalTypeSchema = z.enum([
  "book",
  "reschedule",
  "confirm",
  "cancel",
  "no_show",
]);

const baseProposalFields = {
  proposalId: z.string().min(1),
  summary: z.string().min(1),
};

export const assistantActionProposalSchema = z.discriminatedUnion(
  "actionType",
  [
    z.object({
      ...baseProposalFields,
      actionType: z.literal("book"),
      payload: assistantBookProposalPayloadSchema,
    }),
    z.object({
      ...baseProposalFields,
      actionType: z.literal("reschedule"),
      payload: assistantRescheduleProposalPayloadSchema,
    }),
    z.object({
      ...baseProposalFields,
      actionType: z.literal("confirm"),
      payload: assistantConfirmProposalPayloadSchema,
    }),
    z.object({
      ...baseProposalFields,
      actionType: z.literal("cancel"),
      payload: assistantCancelProposalPayloadSchema,
    }),
    z.object({
      ...baseProposalFields,
      actionType: z.literal("no_show"),
      payload: assistantNoShowProposalPayloadSchema,
    }),
  ],
);

export const assistantActionResultSchema = z.object({
  proposalId: z.string().min(1),
  actionType: assistantProposalTypeSchema,
  success: z.boolean(),
  message: z.string(),
  entityId: uuidSchema.optional(),
});

export const assistantErrorNoticeSchema = z.object({
  message: z.string().min(1),
});

export type AssistantClientTableRow = z.infer<
  typeof assistantClientTableRowSchema
>;
export type AssistantAppointmentTableRow = z.infer<
  typeof assistantAppointmentTableRowSchema
>;
export type AssistantBookProposalPayload = z.infer<
  typeof assistantBookProposalPayloadSchema
>;
export type AssistantRescheduleProposalPayload = z.infer<
  typeof assistantRescheduleProposalPayloadSchema
>;
export type AssistantConfirmProposalPayload = z.infer<
  typeof assistantConfirmProposalPayloadSchema
>;
export type AssistantCancelProposalPayload = z.infer<
  typeof assistantCancelProposalPayloadSchema
>;
export type AssistantNoShowProposalPayload = z.infer<
  typeof assistantNoShowProposalPayloadSchema
>;
export type AssistantActionProposal = z.infer<
  typeof assistantActionProposalSchema
>;
export type AssistantActionResult = z.infer<typeof assistantActionResultSchema>;
export type AssistantErrorNotice = z.infer<typeof assistantErrorNoticeSchema>;
