import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createJourneyDomainTriggerFunction } from "./journey-domain-triggers.js";

describe("journey domain trigger function", () => {
  test("extracts appointment event payload and forwards to planner", async () => {
    const processEvent = mock(async () => ({
      eventId: "event-appointment-scheduled-1",
      eventType: "appointment.scheduled" as const,
      orgId: "org_1",
      plannedRunIds: ["run_1"],
      scheduledDeliveryIds: ["delivery_1"],
      canceledDeliveryIds: [],
      skippedDeliveryIds: [],
      ignoredJourneyIds: [],
      erroredJourneyIds: [],
    }));

    const fn = createJourneyDomainTriggerFunction(
      "appointment.scheduled",
      processEvent,
    );
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          id: "event-appointment-scheduled-1",
          ts: 1_700_000_000_000,
          name: "appointment.scheduled",
          data: {
            orgId: "org_1",
            appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
            calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d14",
            appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d15",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
            startAt: "2026-03-10T14:00:00.000Z",
            endAt: "2026-03-10T15:00:00.000Z",
            timezone: "America/New_York",
            status: "scheduled",
            notes: null,
            appointment: {
              id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
              calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d14",
              appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d15",
              clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
              startAt: "2026-03-10T14:00:00.000Z",
              endAt: "2026-03-10T15:00:00.000Z",
              timezone: "America/New_York",
              status: "scheduled",
              notes: null,
            },
            client: {
              id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
              firstName: "Ada",
              lastName: "Lovelace",
              email: null,
              phone: null,
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      eventId: "event-appointment-scheduled-1",
      plannedRunIds: ["run_1"],
    });

    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-appointment-scheduled-1",
        orgId: "org_1",
        type: "appointment.scheduled",
        payload: {
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d14",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d15",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
          startAt: "2026-03-10T14:00:00.000Z",
          endAt: "2026-03-10T15:00:00.000Z",
          timezone: "America/New_York",
          status: "scheduled",
          notes: null,
          appointment: {
            id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
            calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d14",
            appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d15",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
            startAt: "2026-03-10T14:00:00.000Z",
            endAt: "2026-03-10T15:00:00.000Z",
            timezone: "America/New_York",
            status: "scheduled",
            notes: null,
          },
          client: {
            id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d16",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
            phone: null,
          },
        },
        timestamp: new Date(1_700_000_000_000).toISOString(),
      }),
    );
  });

  test("throws for invalid appointment payload shape", async () => {
    const processEvent = mock(async () => ({
      eventId: "ignored",
      eventType: "appointment.scheduled" as const,
      orgId: "org_1",
      plannedRunIds: [],
      scheduledDeliveryIds: [],
      canceledDeliveryIds: [],
      skippedDeliveryIds: [],
      ignoredJourneyIds: [],
      erroredJourneyIds: [],
    }));

    const fn = createJourneyDomainTriggerFunction(
      "appointment.scheduled",
      processEvent,
    );
    const t = new InngestTestEngine({ function: fn });

    const originalConsoleError = console.error;
    console.error = () => {};

    const execution = await t
      .execute({
        events: [
          {
            name: "appointment.scheduled",
            data: {
              orgId: "org_1",
              appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
            },
          },
        ],
      })
      .finally(() => {
        console.error = originalConsoleError;
      });

    expect(execution.error).toBeDefined();
    expect(execution.error).toEqual(
      expect.objectContaining({
        message: 'Invalid payload for event type "appointment.scheduled".',
      }),
    );

    expect(processEvent).toHaveBeenCalledTimes(0);
  });
});
