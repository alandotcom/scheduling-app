import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timestampSchema,
  nonNegativeIntSchema,
  paginatedResponseSchema,
} from "./common";

const countryCodeSchema = z
  .string()
  .length(2, "Country code must be exactly 2 letters")
  .regex(/^[A-Za-z]{2}$/, "Country code must use ISO 2-letter format")
  .transform((value) => value.toUpperCase());

// Base client schema
export const clientSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(255, "First name is too long"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(255, "Last name is too long"),
  email: z.string().email("Invalid email address").nullable(),
  phone: z.string().max(50, "Phone number is too long").nullable(),
  ...timestampsSchema.shape,
});

// Create client input
export const createClientSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(255, "First name is too long"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(255, "Last name is too long"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(50, "Phone number is too long").optional(),
  phoneCountry: countryCodeSchema.optional(),
});

// Update client input
export const updateClientSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(255, "First name is too long")
    .optional(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(255, "Last name is too long")
    .optional(),
  email: z
    .union([z.string().email("Invalid email address"), z.literal(""), z.null()])
    .optional(),
  phone: z.string().max(50, "Phone number is too long").nullable().optional(),
  phoneCountry: countryCodeSchema.optional(),
});

// List clients query
export const listClientsQuerySchema = z.object({
  search: z.string().optional(), // search by name or email
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

// Response types
export const clientResponseSchema = clientSchema;
export const clientListItemSchema = clientSchema.extend({
  relationshipCounts: z.object({
    appointments: nonNegativeIntSchema,
  }),
});
export const clientListResponseSchema =
  paginatedResponseSchema(clientListItemSchema);

// Client history summary
export const clientHistorySummarySchema = z.object({
  clientId: uuidSchema,
  totalAppointments: nonNegativeIntSchema,
  upcomingAppointments: nonNegativeIntSchema,
  pastAppointments: nonNegativeIntSchema,
  cancelledAppointments: nonNegativeIntSchema,
  noShowAppointments: nonNegativeIntSchema,
  lastAppointmentAt: timestampSchema.nullable(),
  nextAppointmentAt: timestampSchema.nullable(),
});

// Inferred types
export type Client = z.infer<typeof clientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type ClientResponse = z.infer<typeof clientResponseSchema>;
export type ClientListItem = z.infer<typeof clientListItemSchema>;
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
export type ClientHistorySummary = z.infer<typeof clientHistorySummarySchema>;
