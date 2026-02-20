import { appointments, calendars, clients, orgs } from "@scheduling/db/schema";
import { eq } from "drizzle-orm";
import { withOrg, type DbClient } from "../lib/db.js";
import { clientCustomAttributeService } from "./client-custom-attributes.js";
import {
  toDataEnvelopeContext,
  toOptionalDataEnvelopeContext,
} from "./journey-context-shapes.js";

const DEFAULT_ORG_TIMEZONE = "UTC";

export async function loadDeliveryTemplateContext(input: {
  orgId: string;
  appointmentId: string;
}): Promise<Record<string, unknown>> {
  const appointmentPayload = await withOrg(input.orgId, async (tx) => {
    const [row] = await tx
      .select({
        appointmentId: appointments.id,
        calendarId: appointments.calendarId,
        calendarRequiresConfirmation: calendars.requiresConfirmation,
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
      .leftJoin(calendars, eq(calendars.id, appointments.calendarId))
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .where(eq(appointments.id, input.appointmentId))
      .limit(1);

    if (!row) {
      return null;
    }

    let customAttributes: Record<string, unknown> = {};
    if (row.clientId) {
      customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          input.orgId,
          row.clientId,
        );
    }

    const client = row.clientId
      ? {
          id: row.clientId,
          firstName: row.clientFirstName,
          lastName: row.clientLastName,
          email: row.clientEmail,
          phone: row.clientPhone,
          customAttributes,
        }
      : null;

    return {
      appointmentId: row.appointmentId,
      calendarId: row.calendarId,
      calendarRequiresConfirmation: row.calendarRequiresConfirmation ?? false,
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
        calendarRequiresConfirmation: row.calendarRequiresConfirmation ?? false,
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

  const appointmentClientPayload =
    typeof appointmentPayload["client"] === "object"
      ? (appointmentPayload["client"] as Record<string, unknown> | null)
      : null;

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
    appointment: toDataEnvelopeContext(appointmentPayload),
    data: appointmentPayload,
    client: appointmentClientPayload
      ? toDataEnvelopeContext(appointmentClientPayload)
      : null,
  };
}

/**
 * Loads fresh appointment + client data in the flat shape expected by
 * `buildDesiredDeliveries` (matching the appointmentContext / clientContext
 * shapes from `processJourneyDomainEvent`). Also fetches org timezone.
 *
 * Used by `executeWaitResume` to re-plan with up-to-date data after a wait.
 */
export async function loadFreshContextForPlanner(input: {
  orgId: string;
  appointmentId: string;
}): Promise<{
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
} | null> {
  return withOrg(input.orgId, async (tx) =>
    loadFreshContextForPlannerTx({
      tx,
      orgId: input.orgId,
      appointmentId: input.appointmentId,
    }),
  );
}

async function loadFreshContextForPlannerTx(input: {
  tx: DbClient;
  orgId: string;
  appointmentId: string;
}): Promise<{
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
} | null> {
  const [row] = await input.tx
    .select({
      appointmentId: appointments.id,
      calendarId: appointments.calendarId,
      calendarRequiresConfirmation: calendars.requiresConfirmation,
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
    .leftJoin(calendars, eq(calendars.id, appointments.calendarId))
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .where(eq(appointments.id, input.appointmentId))
    .limit(1);

  if (!row) {
    return null;
  }

  const [org] = await input.tx
    .select({ defaultTimezone: orgs.defaultTimezone })
    .from(orgs)
    .where(eq(orgs.id, input.orgId))
    .limit(1);
  const orgTimezone = org?.defaultTimezone ?? DEFAULT_ORG_TIMEZONE;

  const client = row.clientId
    ? {
        id: row.clientId,
        firstName: row.clientFirstName,
        lastName: row.clientLastName,
        email: row.clientEmail,
        phone: row.clientPhone,
      }
    : null;

  const appointmentPayload: Record<string, unknown> = {
    appointmentId: row.appointmentId,
    calendarId: row.calendarId,
    calendarRequiresConfirmation: row.calendarRequiresConfirmation ?? false,
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
      calendarRequiresConfirmation: row.calendarRequiresConfirmation ?? false,
      appointmentTypeId: row.appointmentTypeId,
      clientId: row.clientId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      notes: row.notes,
    },
    client,
  };

  const appointmentContext = toDataEnvelopeContext(appointmentPayload);
  const clientContext = toOptionalDataEnvelopeContext(client);

  return { appointmentContext, clientContext, orgTimezone };
}

export async function loadFreshContextForPlannerByRunTx(input: {
  tx: DbClient;
  orgId: string;
  triggerEntityType: "appointment" | "client";
  triggerEntityId: string;
  appointmentId: string | null;
  clientId: string | null;
}): Promise<{
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
} | null> {
  if (input.triggerEntityType === "appointment") {
    const appointmentId = input.appointmentId ?? input.triggerEntityId;
    return loadFreshContextForPlannerTx({
      tx: input.tx,
      orgId: input.orgId,
      appointmentId,
    });
  }

  // Client-trigger runs
  const clientId = input.clientId ?? input.triggerEntityId;
  const [clientRow] = await input.tx
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!clientRow) {
    return null;
  }

  const [org] = await input.tx
    .select({ defaultTimezone: orgs.defaultTimezone })
    .from(orgs)
    .where(eq(orgs.id, input.orgId))
    .limit(1);
  const orgTimezone = org?.defaultTimezone ?? DEFAULT_ORG_TIMEZONE;

  const customAttributes =
    await clientCustomAttributeService.loadClientCustomAttributes(
      input.tx,
      input.orgId,
      clientRow.id,
    );

  const clientData: Record<string, unknown> = {
    id: clientRow.id,
    clientId: clientRow.id,
    firstName: clientRow.firstName,
    lastName: clientRow.lastName,
    email: clientRow.email,
    phone: clientRow.phone,
    customAttributes,
  };
  const clientContext = toDataEnvelopeContext(clientData);

  return {
    appointmentContext: {},
    clientContext,
    orgTimezone,
  };
}

export async function loadFreshContextForPlannerByRun(input: {
  orgId: string;
  triggerEntityType: "appointment" | "client";
  triggerEntityId: string;
  appointmentId: string | null;
  clientId: string | null;
}): Promise<{
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
} | null> {
  return withOrg(input.orgId, async (tx) =>
    loadFreshContextForPlannerByRunTx({
      tx,
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType,
      triggerEntityId: input.triggerEntityId,
      appointmentId: input.appointmentId,
      clientId: input.clientId,
    }),
  );
}

export async function loadClientDeliveryTemplateContext(input: {
  orgId: string;
  clientId: string;
}): Promise<Record<string, unknown>> {
  const clientPayload = await withOrg(input.orgId, async (tx) => {
    const [row] = await tx
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);

    if (!row) {
      return null;
    }

    const customAttributes =
      await clientCustomAttributeService.loadClientCustomAttributes(
        tx,
        input.orgId,
        row.id,
      );

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      customAttributes,
    };
  });

  if (!clientPayload) {
    return {};
  }

  const clientContext = toDataEnvelopeContext(clientPayload);

  return {
    Client: {
      data: clientPayload,
    },
    client: clientContext,
    data: clientPayload,
  };
}

export async function loadDeliveryTemplateContextByRun(input: {
  orgId: string;
  triggerEntityType: "appointment" | "client";
  appointmentId?: string | null;
  clientId?: string | null;
}): Promise<Record<string, unknown>> {
  if (input.triggerEntityType === "appointment" && input.appointmentId) {
    return loadDeliveryTemplateContext({
      orgId: input.orgId,
      appointmentId: input.appointmentId,
    });
  }

  if (input.triggerEntityType === "client" && input.clientId) {
    return loadClientDeliveryTemplateContext({
      orgId: input.orgId,
      clientId: input.clientId,
    });
  }

  return {};
}
