import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DomainEventDataByType } from "@scheduling/dto";
import { inngest } from "../../inngest/client.js";
import { emitEvent, events } from "./emitter.js";

describe("emitEvent", () => {
  const orgId = "00000000-0000-0000-0000-000000000000";
  const payload: DomainEventDataByType["client.created"] = {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phone: null,
  };

  const originalSend = inngest.send.bind(inngest);

  beforeEach(() => {
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = originalSend;
  });

  afterEach(() => {
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = originalSend;
  });

  test("sends an event to Inngest with deterministic shape", async () => {
    const sendMock = mock(async () => ({ ids: ["test-event-id"] }));
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = sendMock;

    const eventId = await emitEvent(orgId, "client.created", payload);

    expect(eventId).toEqual(expect.any(String));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        name: "client.created",
        data: {
          orgId,
          ...payload,
        },
        ts: expect.any(Number),
      }),
    );
  });

  test("propagates error when Inngest send fails", async () => {
    const sendMock = mock(async () => {
      throw new Error("failed-send");
    });
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = sendMock;

    await expect(emitEvent(orgId, "client.created", payload)).rejects.toThrow(
      "failed-send",
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("uses canonical appointment lifecycle emitters", async () => {
    const sendMock = mock(async () => ({ ids: ["test-event-id"] }));
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = sendMock;

    const appointmentSnapshot: DomainEventDataByType["appointment.scheduled"] =
      {
        appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d23",
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
        startAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
        endAt: new Date("2026-01-01T10:30:00.000Z").toISOString(),
        timezone: "UTC",
        status: "scheduled",
        notes: null,
        appointment: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d23",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
          startAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
          endAt: new Date("2026-01-01T10:30:00.000Z").toISOString(),
          timezone: "UTC",
          status: "scheduled",
          notes: null,
        },
        client: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
          firstName: "Ada",
          lastName: "Lovelace",
          email: null,
          phone: null,
        },
      };

    await events.appointmentScheduled(orgId, appointmentSnapshot);
    await events.appointmentRescheduled(orgId, {
      ...appointmentSnapshot,
      previous: appointmentSnapshot,
    });
    await events.appointmentCanceled(orgId, {
      ...appointmentSnapshot,
      status: "cancelled",
    });

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(sendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "appointment.scheduled" }),
    );
    expect(sendMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "appointment.rescheduled" }),
    );
    expect(sendMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ name: "appointment.canceled" }),
    );
  });

  test("does not expose legacy appointment emitter aliases", () => {
    expect("appointmentCreated" in events).toBeFalse();
    expect("appointmentUpdated" in events).toBeFalse();
    expect("appointmentDeleted" in events).toBeFalse();
  });
});
