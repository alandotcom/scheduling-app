import { appointments, clients } from "@scheduling/db/schema";
import { eq } from "drizzle-orm";
import { withOrg } from "../lib/db.js";

export async function loadDeliveryTemplateContext(input: {
  orgId: string;
  appointmentId: string;
}): Promise<Record<string, unknown>> {
  const appointmentPayload = await withOrg(input.orgId, async (tx) => {
    const [row] = await tx
      .select({
        appointmentId: appointments.id,
        calendarId: appointments.calendarId,
        appointmentTypeId: appointments.appointmentTypeId,
        clientId: appointments.clientId,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
        timezone: appointments.timezone,
        status: appointments.status,
        notes: appointments.notes,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
      })
      .from(appointments)
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .where(eq(appointments.id, input.appointmentId))
      .limit(1);

    if (!row) {
      return null;
    }

    const client = row.clientId
      ? {
          id: row.clientId,
          firstName: row.clientFirstName,
          lastName: row.clientLastName,
          email: row.clientEmail,
          phone: row.clientPhone,
        }
      : null;

    return {
      appointmentId: row.appointmentId,
      calendarId: row.calendarId,
      appointmentTypeId: row.appointmentTypeId,
      clientId: row.clientId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      notes: row.notes,
      appointment: {
        id: row.appointmentId,
        calendarId: row.calendarId,
        appointmentTypeId: row.appointmentTypeId,
        clientId: row.clientId,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        timezone: row.timezone,
        status: row.status,
        notes: row.notes,
      },
      client,
    } satisfies Record<string, unknown>;
  });

  if (!appointmentPayload) {
    return {};
  }

  // TODO(workflow-templating): This context intentionally mirrors trigger
  // payload shape for Appointment references only.
  //
  // Deferred implementation notes for future developers:
  // 1) Merge upstream action outputs so tokens like @Action1.* resolve.
  // 2) Add timezone-aware formatting helpers for SMS/email-friendly dates.
  // 3) Persist a normalized trigger payload snapshot on journey_runs to avoid
  //    this runtime lookup on every delivery dispatch.
  // 4) Introduce strict token validation and a preview endpoint so invalid
  //    templates fail earlier during editor save/publish.
  return {
    Appointment: {
      data: appointmentPayload,
    },
    appointment: {
      data: appointmentPayload,
      ...appointmentPayload,
    },
    data: appointmentPayload,
    client:
      typeof appointmentPayload["client"] === "object"
        ? (appointmentPayload["client"] as Record<string, unknown> | null)
        : null,
  };
}
