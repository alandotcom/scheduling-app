import { tool } from "ai";
import {
  buildProposal,
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
  toolDescriptions,
} from "../routes/assistant-defs.js";
import type { MockFixtures } from "./fixtures/index.js";

/**
 * Build mock assistant tools with identical schemas and descriptions as production,
 * but with fixture-based execute functions instead of real service calls.
 */
export function buildMockAssistantTools(fixtures: MockFixtures) {
  return {
    findClients: tool({
      description: toolDescriptions.findClients,
      inputSchema: findClientsInputSchema,
      execute: async (input) => {
        const query = input.query?.toLowerCase();
        const filtered = query
          ? fixtures.clients.rows.filter(
              (c) =>
                c.fullName.toLowerCase().includes(query) ||
                c.email?.toLowerCase().includes(query) ||
                c.phone?.includes(query),
            )
          : fixtures.clients.rows;
        return { rows: filtered.slice(0, input.limit ?? 10) };
      },
    }),

    findAppointments: tool({
      description: toolDescriptions.findAppointments,
      inputSchema: findAppointmentsInputSchema,
      execute: async (input) => {
        let filtered = fixtures.appointments.rows;
        if (input.clientId) {
          filtered = filtered.filter((a) => a.clientId === input.clientId);
        }
        if (input.status) {
          filtered = filtered.filter((a) => a.status === input.status);
        }
        return { rows: filtered.slice(0, input.limit ?? 10) };
      },
    }),

    getAppointment: tool({
      description: toolDescriptions.getAppointment,
      inputSchema: getAppointmentInputSchema,
      execute: async (input) => {
        const match = fixtures.appointments.rows.find(
          (a) => a.id === input.appointmentId,
        );
        return { rows: match ? [match] : [] };
      },
    }),

    findCalendars: tool({
      description: toolDescriptions.findCalendars,
      inputSchema: findCalendarsInputSchema,
      execute: async (input) => {
        const query = input.query?.toLowerCase();
        const filtered = query
          ? fixtures.calendars.rows.filter((c) =>
              c.name.toLowerCase().includes(query),
            )
          : fixtures.calendars.rows;
        return { rows: filtered.slice(0, input.limit ?? 10) };
      },
    }),

    findAppointmentTypes: tool({
      description: toolDescriptions.findAppointmentTypes,
      inputSchema: findAppointmentTypesInputSchema,
      execute: async (input) => {
        const query = input.query?.toLowerCase();
        const filtered = query
          ? fixtures.appointmentTypes.rows.filter((t) =>
              t.name.toLowerCase().includes(query),
            )
          : fixtures.appointmentTypes.rows;
        return { rows: filtered.slice(0, input.limit ?? 10) };
      },
    }),

    getAvailableSlots: tool({
      description: toolDescriptions.getAvailableSlots,
      inputSchema: getAvailableSlotsInputSchema,
      execute: async () => {
        return fixtures.slots;
      },
    }),

    proposeBookAppointment: tool({
      description: toolDescriptions.proposeBookAppointment,
      inputSchema: proposeBookAppointmentInputSchema,
      execute: async (input) => {
        const client = fixtures.clients.rows.find(
          (c) => c.id === input.clientId,
        );
        const calendar = fixtures.calendars.rows.find(
          (c) => c.id === input.calendarId,
        );
        const aptType = fixtures.appointmentTypes.rows.find(
          (t) => t.id === input.appointmentTypeId,
        );
        return buildProposal({
          actionType: "book",
          summary:
            input.summary ??
            `Book ${aptType?.name ?? "appointment"} for ${client?.fullName ?? "client"} with ${calendar?.name ?? "provider"} at ${input.startTime}`,
          payload: {
            calendarId: input.calendarId,
            appointmentTypeId: input.appointmentTypeId,
            startTime: input.startTime,
            timezone: input.timezone,
            clientId: input.clientId,
            notes: input.notes ?? null,
            ...(client && { clientName: client.fullName }),
            ...(calendar && { calendarName: calendar.name }),
            ...(aptType && { appointmentTypeName: aptType.name }),
          },
        });
      },
    }),

    proposeRescheduleAppointment: tool({
      description: toolDescriptions.proposeRescheduleAppointment,
      inputSchema: proposeRescheduleAppointmentInputSchema,
      execute: async (input) => {
        const appointment = fixtures.appointments.rows.find(
          (a) => a.id === input.appointmentId,
        );
        return buildProposal({
          actionType: "reschedule",
          summary:
            input.summary ??
            `Reschedule ${appointment?.clientName ?? "client"}'s appointment to ${input.newStartTime}`,
          payload: {
            appointmentId: input.appointmentId,
            newStartTime: input.newStartTime,
            timezone: input.timezone,
            ...(appointment && {
              clientName: appointment.clientName,
              calendarName: appointment.calendarName,
              appointmentTypeName: appointment.appointmentTypeName,
              currentStartTime: appointment.startAt,
            }),
          },
        });
      },
    }),

    proposeConfirmAppointment: tool({
      description: toolDescriptions.proposeConfirmAppointment,
      inputSchema: proposeConfirmAppointmentInputSchema,
      execute: async (input) => {
        const appointment = fixtures.appointments.rows.find(
          (a) => a.id === input.appointmentId,
        );
        return buildProposal({
          actionType: "confirm",
          summary:
            input.summary ??
            `Confirm ${appointment?.clientName ?? "client"}'s appointment`,
          payload: {
            appointmentId: input.appointmentId,
            ...(appointment && {
              clientName: appointment.clientName,
              calendarName: appointment.calendarName,
              appointmentTypeName: appointment.appointmentTypeName,
              startTime: appointment.startAt,
            }),
          },
        });
      },
    }),

    proposeCancelAppointment: tool({
      description: toolDescriptions.proposeCancelAppointment,
      inputSchema: proposeCancelAppointmentInputSchema,
      execute: async (input) => {
        const appointment = fixtures.appointments.rows.find(
          (a) => a.id === input.appointmentId,
        );
        return buildProposal({
          actionType: "cancel",
          summary:
            input.summary ??
            `Cancel ${appointment?.clientName ?? "client"}'s appointment`,
          payload: {
            appointmentId: input.appointmentId,
            reason: input.reason ?? null,
            ...(appointment && {
              clientName: appointment.clientName,
              calendarName: appointment.calendarName,
              appointmentTypeName: appointment.appointmentTypeName,
              startTime: appointment.startAt,
            }),
          },
        });
      },
    }),

    proposeNoShowAppointment: tool({
      description: toolDescriptions.proposeNoShowAppointment,
      inputSchema: proposeNoShowAppointmentInputSchema,
      execute: async (input) => {
        const appointment = fixtures.appointments.rows.find(
          (a) => a.id === input.appointmentId,
        );
        return buildProposal({
          actionType: "no_show",
          summary:
            input.summary ??
            `Mark ${appointment?.clientName ?? "client"}'s appointment as no-show`,
          payload: {
            appointmentId: input.appointmentId,
            ...(appointment && {
              clientName: appointment.clientName,
              calendarName: appointment.calendarName,
              appointmentTypeName: appointment.appointmentTypeName,
              startTime: appointment.startAt,
            }),
          },
        });
      },
    }),
  };
}
