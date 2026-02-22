import { describe, expect, test } from "bun:test";
import {
  linearJourneyGraphSchema,
  type JourneyTriggerConfig,
} from "@scheduling/dto";
import { resolveJourneyTriggerRuntime } from "./journey-trigger-engines.js";
import { resolveReference } from "./template-resolution.js";

function createGraph(config: JourneyTriggerConfig) {
  return linearJourneyGraphSchema.parse({
    attributes: {},
    options: { type: "directed" as const },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config,
          },
        },
      },
    ],
    edges: [],
  });
}

function createClientPayload(input?: {
  clientId?: string;
  email?: string | null;
  previousEmail?: string | null;
  renewalDate?: string;
  previousRenewalDate?: string;
}) {
  const clientId = input?.clientId ?? "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24";

  return {
    clientId,
    firstName: "Avery",
    lastName: "Stone",
    email: input?.email ?? null,
    phone: "+14155552671",
    customAttributes: {
      renewalDate: input?.renewalDate ?? "2026-03-10T14:00:00.000Z",
    },
    previous: {
      clientId,
      firstName: "Avery",
      lastName: "Stone",
      email: input?.previousEmail ?? null,
      phone: "+14155552671",
      customAttributes: {
        renewalDate: input?.previousRenewalDate ?? "2026-03-01T14:00:00.000Z",
      },
    },
  };
}

describe("resolveJourneyTriggerRuntime", () => {
  test("normalizes client-trigger context to expose both id and clientId", () => {
    const clientId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24";
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.created",
      payload: {
        clientId,
        firstName: "Avery",
        lastName: "Stone",
        email: null,
        phone: "+14155552671",
        customAttributes: {
          renewalDate: "2026-03-10T14:00:00.000Z",
        },
      },
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved" || runtime.routing === "ignore") {
      return;
    }

    expect(runtime.runIdentity).toEqual({
      triggerEntityType: "client",
      triggerEntityId: clientId,
      appointmentId: null,
      clientId,
    });
    expect(runtime.clientContext["id"]).toBe(clientId);
    expect(runtime.clientContext["clientId"]).toBe(clientId);
    expect(
      resolveReference("@Client.data.clientId", {
        client: runtime.clientContext,
      }),
    ).toBe(clientId);
    expect(
      resolveReference("@Client.data.customAttributes.renewalDate", {
        client: runtime.clientContext,
      }),
    ).toBe("2026-03-10T14:00:00.000Z");
  });

  test("adds a data envelope to appointment context for Appointment.data references", () => {
    const appointmentId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88";
    const graph = createGraph({
      triggerType: "AppointmentJourney",
      start: "appointment.scheduled",
      restart: "appointment.rescheduled",
      stop: "appointment.canceled",
      correlationKey: "appointmentId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "appointment.scheduled",
      payload: {
        appointmentId,
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
        startAt: "2026-03-10T14:00:00.000Z",
        endAt: "2026-03-10T15:00:00.000Z",
        timezone: "America/New_York",
        status: "scheduled",
        notes: null,
        appointment: {
          id: appointmentId,
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
          startAt: "2026-03-10T14:00:00.000Z",
          endAt: "2026-03-10T15:00:00.000Z",
          timezone: "America/New_York",
          status: "scheduled",
          notes: null,
        },
        client: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
          firstName: "Avery",
          lastName: "Stone",
          email: null,
          phone: "+14155552671",
          customAttributes: {},
        },
      },
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved" || runtime.routing === "ignore") {
      return;
    }

    expect(
      resolveReference("@Appointment.data.startAt", {
        appointment: runtime.appointmentContext,
      }),
    ).toBe("2026-03-10T14:00:00.000Z");
    expect(runtime.runIdentity).toEqual({
      triggerEntityType: "appointment",
      triggerEntityId: appointmentId,
      appointmentId,
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
    });
  });

  test("derives appointment-trigger client identity from nested payload client context", () => {
    const appointmentId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88";
    const clientId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13";
    const graph = createGraph({
      triggerType: "AppointmentJourney",
      start: "appointment.scheduled",
      restart: "appointment.rescheduled",
      stop: "appointment.canceled",
      correlationKey: "appointmentId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "appointment.scheduled",
      payload: {
        appointmentId,
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        clientId: undefined as unknown as string,
        startAt: "2026-03-10T14:00:00.000Z",
        endAt: "2026-03-10T15:00:00.000Z",
        timezone: "America/New_York",
        status: "scheduled",
        notes: null,
        appointment: {
          id: appointmentId,
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
          clientId,
          startAt: "2026-03-10T14:00:00.000Z",
          endAt: "2026-03-10T15:00:00.000Z",
          timezone: "America/New_York",
          status: "scheduled",
          notes: null,
        },
        client: {
          id: clientId,
          firstName: "Avery",
          lastName: "Stone",
          email: null,
          phone: "+14155552671",
          customAttributes: {},
        },
      },
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved" || runtime.routing === "ignore") {
      return;
    }

    expect(runtime.runIdentity.clientId).toBe(clientId);
  });

  test("ignores mismatched event types for appointment triggers without run identity lookups", () => {
    const graph = createGraph({
      triggerType: "AppointmentJourney",
      start: "appointment.scheduled",
      restart: "appointment.rescheduled",
      stop: "appointment.canceled",
      correlationKey: "appointmentId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.created",
      payload: {
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
        firstName: "Avery",
        lastName: "Stone",
        email: null,
        phone: null,
        customAttributes: {},
      },
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("ignore");
  });

  test("ignores appointment.confirmed for appointment trigger routing", () => {
    const graph = createGraph({
      triggerType: "AppointmentJourney",
      start: "appointment.scheduled",
      restart: "appointment.rescheduled",
      stop: "appointment.canceled",
      correlationKey: "appointmentId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "appointment.confirmed",
      payload: {
        appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
        startAt: "2026-03-10T14:00:00.000Z",
        endAt: "2026-03-10T15:00:00.000Z",
        timezone: "America/New_York",
        status: "confirmed",
        notes: null,
        appointment: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
          startAt: "2026-03-10T14:00:00.000Z",
          endAt: "2026-03-10T15:00:00.000Z",
          timezone: "America/New_York",
          status: "confirmed",
          notes: null,
        },
        client: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
          firstName: "Avery",
          lastName: "Stone",
          email: null,
          phone: "+14155552671",
          customAttributes: {},
        },
      },
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("ignore");
  });

  test("plans client.updated runs only when the tracked attribute changes", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "renewalDate",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.updated",
      payload: createClientPayload({
        renewalDate: "2026-04-10T14:00:00.000Z",
        previousRenewalDate: "2026-03-10T14:00:00.000Z",
      }),
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("plan");
  });

  test("ignores client.updated when tracked attribute value is unchanged", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "renewalDate",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.updated",
      payload: createClientPayload({
        renewalDate: "2026-04-10T14:00:00.000Z",
        previousRenewalDate: "2026-04-10T14:00:00.000Z",
      }),
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("ignore");
  });

  test("plans client.updated runs when a built-in tracked client field changes", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "client.email",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.updated",
      payload: createClientPayload({
        email: "new@example.com",
        previousEmail: "old@example.com",
      }),
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("plan");
  });

  test("ignores client.updated when a built-in tracked client field is unchanged", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "client.email",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.updated",
      payload: createClientPayload({
        email: "same@example.com",
        previousEmail: "same@example.com",
      }),
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("ignore");
  });

  test("ignores mismatched event types for client.created triggers", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.updated",
      payload: createClientPayload(),
    });

    expect(runtime.status).toBe("resolved");
    if (runtime.status !== "resolved") {
      return;
    }

    expect(runtime.routing).toBe("ignore");
  });

  test("returns missing_run_identity when client trigger payload lacks clientId", () => {
    const graph = createGraph({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
    });

    const runtime = resolveJourneyTriggerRuntime({
      graph,
      eventType: "client.created",
      payload: {
        clientId: undefined as unknown as string,
        firstName: "Avery",
        lastName: "Stone",
        email: null,
        phone: null,
        customAttributes: {},
      },
    });

    expect(runtime).toEqual({ status: "missing_run_identity" });
  });
});
