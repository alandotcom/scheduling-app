import { Hono } from "hono";
import { gateway } from "@ai-sdk/gateway";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
} from "ai";
import { config } from "../config.js";
import { appointmentTypeService } from "../services/appointment-types.js";
import { appointmentService } from "../services/appointments.js";
import { availabilityService } from "../services/availability-engine/index.js";
import { calendarService } from "../services/calendars.js";
import { clientService } from "../services/clients.js";
import type { ServiceContext } from "../services/locations.js";
import {
  buildProposal,
  buildSystemPrompt,
  findAppointmentsInputSchema,
  findAppointmentTypesInputSchema,
  findCalendarsInputSchema,
  findClientsInputSchema,
  getAppointmentInputSchema,
  getAvailableSlotsInputSchema,
  proposeBookAppointmentInputSchema,
  proposeCancelAppointmentInputSchema,
  proposeConfirmAppointmentInputSchema,
  proposeNoShowAppointmentInputSchema,
  proposeRescheduleAppointmentInputSchema,
  toAppointmentTableRow,
  toClientTableRow,
  toIsoString,
  toolDescriptions,
} from "./assistant-defs.js";

// Re-export all pure definitions so existing consumers (tests, etc.) are unaffected
export * from "./assistant-defs.js";

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
      description: toolDescriptions.findClients,
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
      description: toolDescriptions.findAppointments,
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
      description: toolDescriptions.getAppointment,
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
      description: toolDescriptions.findCalendars,
      inputSchema: findCalendarsInputSchema,
      execute: async (input) => {
        const result = await calendarService.list(
          { limit: Math.min(100, input.limit * 3) },
          context,
        );
        const query = input.query?.toLowerCase();

        // If an appointmentTypeId is provided, resolve linked calendar IDs via the service
        let linkedCalendarIds: Set<string> | null = null;
        if (input.appointmentTypeId) {
          const links = await appointmentTypeService.listCalendars(
            input.appointmentTypeId,
            context,
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
      description: toolDescriptions.findAppointmentTypes,
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
      description: toolDescriptions.getAvailableSlots,
      inputSchema: getAvailableSlotsInputSchema,
      execute: async (input) => {
        const [slots, calendar] = await Promise.all([
          availabilityService.getAvailableSlots(
            {
              calendarId: input.calendarId,
              appointmentTypeId: input.appointmentTypeId,
              startDate: input.startDate,
              endDate: input.endDate,
            },
            context,
          ),
          calendarService.get(input.calendarId, context),
        ]);

        const availableSlots = slots.filter((s) => s.available);

        return {
          totalSlots: slots.length,
          availableCount: availableSlots.length,
          calendarTimezone: calendar.timezone,
          slots: availableSlots.slice(0, 20).map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            remainingCapacity: slot.remainingCapacity,
          })),
        };
      },
    }),
    proposeBookAppointment: tool({
      description: toolDescriptions.proposeBookAppointment,
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
      description: toolDescriptions.proposeRescheduleAppointment,
      inputSchema: proposeRescheduleAppointmentInputSchema,
      execute: async (input) => {
        const parsedStartTime = new Date(input.newStartTime);
        if (Number.isNaN(parsedStartTime.getTime())) {
          throw new Error("Invalid newStartTime. Use a valid ISO datetime.");
        }

        const { startTime: currentStartTime, ...displayNames } =
          await resolveAppointmentDisplayNames(input.appointmentId, context);

        return buildProposal({
          actionType: "reschedule",
          summary:
            input.summary ??
            `Reschedule appointment ${input.appointmentId} to ${parsedStartTime.toISOString()} (${input.timezone}).`,
          payload: {
            appointmentId: input.appointmentId,
            newStartTime: parsedStartTime.toISOString(),
            timezone: input.timezone,
            ...displayNames,
            ...(currentStartTime && { currentStartTime }),
          },
        });
      },
    }),
    proposeConfirmAppointment: tool({
      description: toolDescriptions.proposeConfirmAppointment,
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
      description: toolDescriptions.proposeCancelAppointment,
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
      description: toolDescriptions.proposeNoShowAppointment,
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
  const validatedMessages = await validateUIMessages({
    messages: rawMessages,
  });
  // Strip system-role messages to prevent prompt injection via crafted requests.
  // The server controls the system prompt exclusively via buildSystemPrompt().
  const messages = validatedMessages.filter((m) => m.role !== "system");
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
  /** Max tool-call round-trips before the AI stops. Prevents runaway loops. */
  const MAX_ASSISTANT_STEPS = 8;

  const result = streamText({
    model: gateway(config.ai.assistantModel),
    system: buildSystemPrompt(new Date()),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(MAX_ASSISTANT_STEPS),
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
});

export { assistantRouter };
