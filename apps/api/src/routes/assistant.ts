import { Hono } from "hono";
import { gateway } from "@ai-sdk/gateway";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
} from "ai";
import { eq } from "drizzle-orm";
import { appointmentTypeCalendars } from "@scheduling/db/schema";
import {
  assistantActionProposalSchema,
  assistantAppointmentTableRowSchema,
  assistantClientTableRowSchema,
} from "@scheduling/dto";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../lib/db.js";
import { appointmentTypeService } from "../services/appointment-types.js";
import { appointmentService } from "../services/appointments.js";
import { availabilityService } from "../services/availability-engine/index.js";
import { calendarService } from "../services/calendars.js";
import { clientService } from "../services/clients.js";
import type { ServiceContext } from "../services/locations.js";

const findClientsInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

const findAppointmentsInputSchema = z.object({
  clientId: z.uuid().optional(),
  status: z.enum(["scheduled", "confirmed", "cancelled", "no_show"]).optional(),
  scope: z.enum(["upcoming", "history", "all"]).default("upcoming"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

const getAppointmentInputSchema = z.object({
  appointmentId: z.uuid(),
});

const findCalendarsInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  appointmentTypeId: z
    .uuid()
    .optional()
    .describe(
      "Filter to calendars linked to this appointment type. Use this during booking to show only relevant calendars.",
    ),
  limit: z.number().int().min(1).max(25).default(10),
});

const findAppointmentTypesInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

const getAvailableSlotsInputSchema = z.object({
  calendarId: z.uuid(),
  appointmentTypeId: z.uuid(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Start date (YYYY-MM-DD)"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("End date (YYYY-MM-DD). Max 7 days from startDate."),
});

const proposeBookAppointmentInputSchema = z.object({
  calendarId: z.uuid(),
  appointmentTypeId: z.uuid(),
  startTime: z.string().min(1),
  timezone: z.string().min(1),
  clientId: z.uuid(),
  notes: z.string().nullable().optional(),
  summary: z.string().trim().min(1).optional(),
});

const proposeRescheduleAppointmentInputSchema = z.object({
  appointmentId: z.uuid(),
  newStartTime: z.string().min(1),
  timezone: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
});

const proposeConfirmAppointmentInputSchema = z.object({
  appointmentId: z.uuid(),
  summary: z.string().trim().min(1).optional(),
});

const proposeCancelAppointmentInputSchema = z.object({
  appointmentId: z.uuid(),
  reason: z.string().nullable().optional(),
  summary: z.string().trim().min(1).optional(),
});

const proposeNoShowAppointmentInputSchema = z.object({
  appointmentId: z.uuid(),
  summary: z.string().trim().min(1).optional(),
});

export function toIsoString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function toClientTableRow(input: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  relationshipCounts?: { appointments: number };
  createdAt: Date | string;
}) {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  return assistantClientTableRowSchema.parse({
    id: input.id,
    fullName: fullName.length > 0 ? fullName : "Unknown Client",
    email: input.email,
    phone: input.phone,
    appointmentCount: input.relationshipCounts?.appointments ?? 0,
    createdAt: toIsoString(input.createdAt),
  });
}

export function toAppointmentTableRow(input: {
  id: string;
  clientId: string;
  calendarId?: string | null;
  appointmentTypeId?: string | null;
  startAt: Date | string;
  endAt: Date | string;
  timezone: string;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  calendar?: { name: string } | undefined;
  appointmentType?: { name: string } | undefined;
  client: { firstName: string; lastName: string };
}) {
  const clientName =
    `${input.client.firstName} ${input.client.lastName}`.trim();
  return assistantAppointmentTableRowSchema.parse({
    id: input.id,
    clientId: input.clientId,
    clientName: clientName.length > 0 ? clientName : "Unknown Client",
    calendarId: input.calendarId ?? null,
    appointmentTypeId: input.appointmentTypeId ?? null,
    startAt: toIsoString(input.startAt),
    endAt: toIsoString(input.endAt),
    timezone: input.timezone,
    status: input.status,
    calendarName: input.calendar?.name ?? null,
    appointmentTypeName: input.appointmentType?.name ?? null,
  });
}

export function buildProposal(input: {
  actionType: "book" | "reschedule" | "confirm" | "cancel" | "no_show";
  summary: string;
  payload: unknown;
}) {
  return {
    proposal: assistantActionProposalSchema.parse({
      proposalId: crypto.randomUUID(),
      actionType: input.actionType,
      summary: input.summary,
      payload: input.payload,
    }),
  };
}

export function buildSystemPrompt(now: Date) {
  return [
    "You are an internal scheduling assistant for clinic staff.",
    `Today's date is ${now.toISOString().slice(0, 10)}.`,
    "",
    "## Your Capabilities",
    "You have tools to search and inspect all scheduling data. USE THEM — never say you cannot look something up.",
    "- **findClients**: Search clients by name, email, or phone.",
    "- **findAppointments**: Search appointments by client, status, date range, or scope (upcoming/history/all). Use this to check what's on the schedule.",
    "- **getAppointment**: Get full details of a single appointment by ID.",
    "- **findCalendars**: List provider calendars (e.g. Dr. Smith, Dr. Patel). Use this to resolve calendar IDs. Supports filtering by appointmentTypeId to show only calendars linked to that type.",
    "- **findAppointmentTypes**: List appointment types (e.g. Initial Consultation, Follow-up). Use this to resolve appointment type IDs and durations.",
    "- **getAvailableSlots**: Get open time slots for a calendar + appointment type in a date range. Use this to answer availability questions.",
    "- **Proposal tools**: Prepare book/reschedule/confirm/cancel/no-show proposals for the user to confirm.",
    "",
    "## Booking Flow",
    "When booking an appointment, gather these details: client, appointment type, calendar (provider), and time slot.",
    "If the user provides multiple details upfront (e.g. client name, type, provider, preferred time), resolve as many steps as possible in parallel before asking. Only prompt the user for information that is missing or ambiguous.",
    "If the user provides no details, walk through each step sequentially:",
    "1. **Select client** → call findClients if needed, wait for selection",
    "2. **Select appointment type** → call findAppointmentTypes, wait for selection",
    "3. **Select calendar(s)** → call findCalendars with appointmentTypeId to filter to linked calendars, wait for selection",
    "4. **Select time slot** → call getAvailableSlots for the chosen calendar + type, wait for selection",
    "5. **Propose booking** → call proposeBookAppointment with all gathered IDs",
    "",
    "## Rules",
    "- When a lookup returns exactly one result, proceed to the next step automatically — do not ask the user to pick.",
    "- Track the user's intent throughout the conversation. If the user asked to reschedule, always use proposeRescheduleAppointment — never proposeBookAppointment, even if you called getAvailableSlots in between.",
    "- Client and appointment results link to their detail pages in the app. Do not expect users to click these to make selections — they will type their choice or you should proceed when there's only one result.",
    "- When asked about availability or open slots: first resolve the calendarId and appointmentTypeId using findCalendars/findAppointmentTypes, then call getAvailableSlots. Never say you can't check availability.",
    "- For booking/rescheduling/confirming/cancelling/no-show: do not execute changes directly. Call the matching proposal tool and let the user confirm in the UI.",
    "- Before proposing changes, use lookup tools first to verify exact IDs.",
    "- Never ask the user for a timezone. Infer the timezone from the calendar's timezone (returned by findCalendars). Use that timezone when creating proposals.",
    "- When calling proposal tools, ALWAYS provide a `summary` that includes the client's name, appointment type, provider name, and time in human-readable form. Never include UUIDs in summaries.",
    "- If required details are missing, ask a concise follow-up question.",
    "",
    "## Response Format",
    "CRITICAL: Tool results (client lists, appointment tables, available slots, calendar lists, etc.) are rendered automatically as rich, interactive UI components. The user can see AND click on items to make selections — their click sends a message with their choice. They can also type their answer instead. NEVER repeat, restate, list, summarize, or tabulate the data in your text — they already see it.",
    "Your text response MUST be extremely concise — one short sentence maximum, often just a fragment. Examples:",
    '- "Found 5 upcoming appointments." (NOT "Here\'s a look at all 5 upcoming appointments. They span from Feb 26 through March...")',
    '- "3 available slots this week."',
    '- "2 clients match."',
    "Do NOT:",
    "- Describe what the data shows (counts by status, date ranges, provider breakdowns, etc.)",
    "- Offer to take actions unprompted (no 'Would you like to confirm/reschedule/cancel?')",
    "- Add commentary about the results",
    "- Use multiple sentences when one will do",
    "NEVER include markdown tables, numbered lists of records, or row-by-row data in your text. The UI handles all data display.",
  ].join("\n");
}

async function resolveAppointmentDisplayNames(
  appointmentId: string,
  context: ServiceContext,
): Promise<{
  clientName?: string;
  calendarName?: string;
  appointmentTypeName?: string;
  startTime?: string;
}> {
  try {
    const appointment = await appointmentService.get(appointmentId, context);
    const clientName =
      `${appointment.client.firstName} ${appointment.client.lastName}`.trim() ||
      undefined;
    return {
      ...(clientName && { clientName }),
      ...(appointment.calendar?.name && {
        calendarName: appointment.calendar.name,
      }),
      ...(appointment.appointmentType?.name && {
        appointmentTypeName: appointment.appointmentType.name,
      }),
      startTime: toIsoString(appointment.startAt),
    };
  } catch {
    return {};
  }
}

function buildAssistantTools(context: ServiceContext) {
  return {
    findClients: tool({
      description:
        "Find clients by name/email/phone and return rows for a structured client table.",
      inputSchema: findClientsInputSchema,
      execute: async (input) => {
        const clients = await clientService.list(
          {
            search: input.query,
            limit: input.limit,
            sort: "updated_at_desc",
          },
          context,
        );

        return {
          rows: clients.items.map((client) => toClientTableRow(client)),
        };
      },
    }),
    findAppointments: tool({
      description:
        "Find appointments using filters and return rows for a structured appointment table.",
      inputSchema: findAppointmentsInputSchema,
      execute: async (input) => {
        const appointments = await appointmentService.list(
          {
            clientId: input.clientId,
            status: input.status,
            scope: input.scope,
            startDate: input.startDate,
            endDate: input.endDate,
            limit: input.limit,
          },
          context,
        );

        return {
          rows: appointments.items.map((appointment) =>
            toAppointmentTableRow(appointment),
          ),
        };
      },
    }),
    getAppointment: tool({
      description: "Get a single appointment by ID.",
      inputSchema: getAppointmentInputSchema,
      execute: async (input) => {
        const appointment = await appointmentService.get(
          input.appointmentId,
          context,
        );

        return {
          rows: [toAppointmentTableRow(appointment)],
        };
      },
    }),
    findCalendars: tool({
      description:
        "List calendars to resolve calendar IDs before booking or rescheduling. Optionally filter by appointmentTypeId to show only calendars linked to that type.",
      inputSchema: findCalendarsInputSchema,
      execute: async (input) => {
        const result = await calendarService.list(
          { limit: Math.min(100, input.limit * 3) },
          context,
        );
        const query = input.query?.toLowerCase();

        // If an appointmentTypeId is provided, resolve linked calendar IDs
        let linkedCalendarIds: Set<string> | null = null;
        if (input.appointmentTypeId) {
          const links = await db
            .select({ calendarId: appointmentTypeCalendars.calendarId })
            .from(appointmentTypeCalendars)
            .where(
              eq(
                appointmentTypeCalendars.appointmentTypeId,
                input.appointmentTypeId,
              ),
            );
          linkedCalendarIds = new Set(links.map((l) => l.calendarId));
        }

        let filtered = result.items;
        if (query) {
          filtered = filtered.filter((calendar) =>
            calendar.name.toLowerCase().includes(query),
          );
        }
        if (linkedCalendarIds) {
          filtered = filtered.filter((calendar) =>
            linkedCalendarIds.has(calendar.id),
          );
        }

        return {
          rows: filtered.slice(0, input.limit).map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            timezone: calendar.timezone,
            requiresConfirmation: calendar.requiresConfirmation,
            locationId: calendar.locationId,
          })),
        };
      },
    }),
    findAppointmentTypes: tool({
      description:
        "List appointment types to resolve appointmentType IDs before booking.",
      inputSchema: findAppointmentTypesInputSchema,
      execute: async (input) => {
        const result = await appointmentTypeService.list(
          { limit: Math.min(100, input.limit * 3) },
          context,
        );
        const query = input.query?.toLowerCase();
        const filtered = query
          ? result.items.filter((appointmentType) =>
              appointmentType.name.toLowerCase().includes(query),
            )
          : result.items;

        return {
          rows: filtered.slice(0, input.limit).map((appointmentType) => ({
            id: appointmentType.id,
            name: appointmentType.name,
            durationMin: appointmentType.durationMin,
            capacity: appointmentType.capacity,
          })),
        };
      },
    }),
    getAvailableSlots: tool({
      description:
        "Get available time slots for a calendar and appointment type within a date range. Use this to answer availability questions. Requires calendarId and appointmentTypeId — use findCalendars and findAppointmentTypes first if needed.",
      inputSchema: getAvailableSlotsInputSchema,
      execute: async (input) => {
        const slots = await availabilityService.getAvailableSlots(
          {
            calendarId: input.calendarId,
            appointmentTypeId: input.appointmentTypeId,
            startDate: input.startDate,
            endDate: input.endDate,
          },
          context,
        );

        const availableSlots = slots.filter((s) => s.available);

        return {
          totalSlots: slots.length,
          availableCount: availableSlots.length,
          slots: availableSlots.slice(0, 20).map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            remainingCapacity: slot.remainingCapacity,
          })),
        };
      },
    }),
    proposeBookAppointment: tool({
      description:
        "Prepare a book-appointment proposal. This does not execute booking.",
      inputSchema: proposeBookAppointmentInputSchema,
      execute: async (input) => {
        const parsedStartTime = new Date(input.startTime);
        if (Number.isNaN(parsedStartTime.getTime())) {
          throw new Error("Invalid startTime. Use a valid ISO datetime.");
        }

        // Resolve display names for the proposal card
        let clientName: string | undefined;
        let calendarName: string | undefined;
        let appointmentTypeName: string | undefined;
        try {
          const [client, calendar, appointmentType] = await Promise.all([
            clientService.get(input.clientId, context),
            calendarService.get(input.calendarId, context),
            appointmentTypeService.get(input.appointmentTypeId, context),
          ]);
          const name =
            `${client.firstName} ${client.lastName}`.trim() || undefined;
          clientName = name;
          calendarName = calendar.name || undefined;
          appointmentTypeName = appointmentType.name || undefined;
        } catch {
          // Continue without display names
        }

        return buildProposal({
          actionType: "book",
          summary:
            input.summary ??
            `Book a new appointment for client ${input.clientId} at ${parsedStartTime.toISOString()} (${input.timezone}).`,
          payload: {
            calendarId: input.calendarId,
            appointmentTypeId: input.appointmentTypeId,
            startTime: parsedStartTime.toISOString(),
            timezone: input.timezone,
            clientId: input.clientId,
            notes: input.notes ?? null,
            ...(clientName && { clientName }),
            ...(calendarName && { calendarName }),
            ...(appointmentTypeName && { appointmentTypeName }),
          },
        });
      },
    }),
    proposeRescheduleAppointment: tool({
      description:
        "Prepare a reschedule proposal. This does not execute rescheduling.",
      inputSchema: proposeRescheduleAppointmentInputSchema,
      execute: async (input) => {
        const parsedStartTime = new Date(input.newStartTime);
        if (Number.isNaN(parsedStartTime.getTime())) {
          throw new Error("Invalid newStartTime. Use a valid ISO datetime.");
        }

        // Resolve display names from the appointment
        let clientName: string | undefined;
        let calendarName: string | undefined;
        let appointmentTypeName: string | undefined;
        let currentStartTime: string | undefined;
        try {
          const appointment = await appointmentService.get(
            input.appointmentId,
            context,
          );
          const name =
            `${appointment.client.firstName} ${appointment.client.lastName}`.trim() ||
            undefined;
          clientName = name;
          calendarName = appointment.calendar?.name || undefined;
          appointmentTypeName = appointment.appointmentType?.name || undefined;
          currentStartTime = toIsoString(appointment.startAt);
        } catch {
          // Continue without display names
        }

        return buildProposal({
          actionType: "reschedule",
          summary:
            input.summary ??
            `Reschedule appointment ${input.appointmentId} to ${parsedStartTime.toISOString()} (${input.timezone}).`,
          payload: {
            appointmentId: input.appointmentId,
            newStartTime: parsedStartTime.toISOString(),
            timezone: input.timezone,
            ...(clientName && { clientName }),
            ...(calendarName && { calendarName }),
            ...(appointmentTypeName && { appointmentTypeName }),
            ...(currentStartTime && { currentStartTime }),
          },
        });
      },
    }),
    proposeConfirmAppointment: tool({
      description:
        "Prepare a confirm-appointment proposal. This does not execute confirmation.",
      inputSchema: proposeConfirmAppointmentInputSchema,
      execute: async (input) => {
        const displayNames = await resolveAppointmentDisplayNames(
          input.appointmentId,
          context,
        );

        return buildProposal({
          actionType: "confirm",
          summary:
            input.summary ?? `Confirm appointment ${input.appointmentId}.`,
          payload: {
            appointmentId: input.appointmentId,
            ...displayNames,
          },
        });
      },
    }),
    proposeCancelAppointment: tool({
      description:
        "Prepare a cancel-appointment proposal. This does not execute cancellation.",
      inputSchema: proposeCancelAppointmentInputSchema,
      execute: async (input) => {
        const displayNames = await resolveAppointmentDisplayNames(
          input.appointmentId,
          context,
        );

        return buildProposal({
          actionType: "cancel",
          summary:
            input.summary ?? `Cancel appointment ${input.appointmentId}.`,
          payload: {
            appointmentId: input.appointmentId,
            reason: input.reason ?? null,
            ...displayNames,
          },
        });
      },
    }),
    proposeNoShowAppointment: tool({
      description:
        "Prepare a no-show proposal. This does not execute the update.",
      inputSchema: proposeNoShowAppointmentInputSchema,
      execute: async (input) => {
        const displayNames = await resolveAppointmentDisplayNames(
          input.appointmentId,
          context,
        );

        return buildProposal({
          actionType: "no_show",
          summary:
            input.summary ??
            `Mark appointment ${input.appointmentId} as no-show.`,
          payload: {
            appointmentId: input.appointmentId,
            ...displayNames,
          },
        });
      },
    }),
  };
}

const assistantRouter = new Hono();

assistantRouter.post("/chat", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401,
    );
  }

  const orgId = c.get("orgId");
  if (!orgId) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Active organization required",
        },
      },
      401,
    );
  }

  let rawMessages: unknown;
  try {
    const body = await c.req.json();
    rawMessages = body.messages;
  } catch {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid chat request body",
        },
      },
      400,
    );
  }

  const serviceContext: ServiceContext = { orgId, userId };
  const tools = buildAssistantTools(serviceContext);
  const messages = await validateUIMessages({
    messages: rawMessages,
  });
  if (messages.length === 0) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "At least one chat message is required",
        },
      },
      400,
    );
  }
  const result = streamText({
    model: gateway(config.ai.assistantModel),
    system: buildSystemPrompt(new Date()),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
});

export { assistantRouter };
