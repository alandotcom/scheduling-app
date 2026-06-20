import {
  domainEventDataSchemaByType,
  startJourneyTestRunSchema,
  type CustomAttributeValues,
  type StartJourneyTestRunInput,
} from "@scheduling/dto";
import { appointments } from "@scheduling/db/schema";
import { ApplicationError } from "../../errors/application-error.js";

// Test-run input validation and payload synthesis: turns a stored appointment +
// client snapshot into the `appointment.scheduled` domain-event payload the
// planner consumes when an operator starts a journey test run.

export function validateStartTestRunInput(
  input: StartJourneyTestRunInput,
): StartJourneyTestRunInput {
  const parsed = startJourneyTestRunSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid test run payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function mapAppointmentToScheduledPayload(appointment: {
  appointment: Pick<
    typeof appointments.$inferSelect,
    | "id"
    | "calendarId"
    | "appointmentTypeId"
    | "clientId"
    | "startAt"
    | "endAt"
    | "timezone"
    | "status"
    | "notes"
  > & {
    calendarRequiresConfirmation: boolean;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    customAttributes: CustomAttributeValues;
  };
}) {
  const appointmentSnapshot = appointment.appointment;
  const clientSnapshot = {
    id: appointment.client.id,
    firstName: appointment.client.firstName,
    lastName: appointment.client.lastName,
    email: appointment.client.email,
    phone: appointment.client.phone,
    customAttributes: appointment.client.customAttributes,
  };

  const parsed = domainEventDataSchemaByType["appointment.scheduled"].safeParse(
    {
      appointmentId: appointmentSnapshot.id,
      calendarId: appointmentSnapshot.calendarId,
      calendarRequiresConfirmation:
        appointmentSnapshot.calendarRequiresConfirmation,
      appointmentTypeId: appointmentSnapshot.appointmentTypeId,
      clientId: appointmentSnapshot.clientId,
      startAt: appointmentSnapshot.startAt.toISOString(),
      endAt: appointmentSnapshot.endAt.toISOString(),
      timezone: appointmentSnapshot.timezone,
      status: appointmentSnapshot.status,
      notes: appointmentSnapshot.notes,
      appointment: {
        id: appointmentSnapshot.id,
        calendarId: appointmentSnapshot.calendarId,
        calendarRequiresConfirmation:
          appointmentSnapshot.calendarRequiresConfirmation,
        appointmentTypeId: appointmentSnapshot.appointmentTypeId,
        clientId: appointmentSnapshot.clientId,
        startAt: appointmentSnapshot.startAt.toISOString(),
        endAt: appointmentSnapshot.endAt.toISOString(),
        timezone: appointmentSnapshot.timezone,
        status: appointmentSnapshot.status,
        notes: appointmentSnapshot.notes,
      },
      client: clientSnapshot,
    },
  );

  if (!parsed.success) {
    throw new ApplicationError("Appointment payload is invalid for test run", {
      code: "CONFLICT",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}
