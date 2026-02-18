import { describe, expect, test } from "bun:test";
import {
  domainEventTypeSchema,
  domainEventTypes,
  domainEventDataSchemaByType,
  type WebhookEventType,
  webhookEventTypeSchema,
} from "./index";

const updatedEventFixtures: Array<{
  type: WebhookEventType;
  payload: Record<string, unknown>;
}> = [
  {
    type: "appointment.rescheduled",
    payload: {
      appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d03",
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
      startAt: "2026-02-15T09:00:00Z",
      endAt: "2026-02-15T09:30:00Z",
      timezone: "America/New_York",
      status: "scheduled",
      notes: "Updated note",
      appointment: {
        id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d03",
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
        startAt: "2026-02-15T09:00:00Z",
        endAt: "2026-02-15T09:30:00Z",
        timezone: "America/New_York",
        status: "scheduled",
        notes: "Updated note",
      },
      client: {
        id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
        firstName: "Ada",
        lastName: "Lovelace",
        email: null,
        phone: null,
      },
      previous: {
        appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d03",
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
        startAt: "2026-02-15T08:00:00Z",
        endAt: "2026-02-15T08:30:00Z",
        timezone: "America/New_York",
        status: "scheduled",
        notes: null,
        appointment: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
          calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
          appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d03",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
          startAt: "2026-02-15T08:00:00Z",
          endAt: "2026-02-15T08:30:00Z",
          timezone: "America/New_York",
          status: "scheduled",
          notes: null,
        },
        client: {
          id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
          firstName: "Ada",
          lastName: "Lovelace",
          email: null,
          phone: null,
        },
      },
    },
  },
  {
    type: "calendar.updated",
    payload: {
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      name: "Updated Calendar",
      timezone: "America/New_York",
      locationId: null,
      previous: {
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        name: "Old Calendar",
        timezone: "UTC",
        locationId: null,
      },
    },
  },
  {
    type: "appointment_type.updated",
    payload: {
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
      name: "Updated Type",
      durationMin: 60,
      paddingBeforeMin: 10,
      paddingAfterMin: 5,
      capacity: null,
      metadata: { mode: "telehealth" },
      previous: {
        appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
        name: "Old Type",
        durationMin: 45,
        paddingBeforeMin: null,
        paddingAfterMin: null,
        capacity: 1,
        metadata: null,
      },
    },
  },
  {
    type: "resource.updated",
    payload: {
      resourceId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d31",
      name: "Room",
      quantity: 5,
      locationId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d32",
      previous: {
        resourceId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d31",
        name: "Old Room",
        quantity: 2,
        locationId: null,
      },
    },
  },
  {
    type: "location.updated",
    payload: {
      locationId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d41",
      name: "Updated Office",
      timezone: "America/Chicago",
      previous: {
        locationId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d41",
        name: "Old Office",
        timezone: "America/New_York",
      },
    },
  },
  {
    type: "client.updated",
    payload: {
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d51",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      previous: {
        clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d51",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+15551234567",
      },
    },
  },
];

describe("webhook updated event schemas", () => {
  test.each(
    updatedEventFixtures,
  )("accepts %s payload as full snapshot + previous", ({ type, payload }) => {
    expect(domainEventDataSchemaByType[type].safeParse(payload).success).toBe(
      true,
    );
  });

  test("rejects legacy appointment.rescheduled payload with changes object", () => {
    expect(
      domainEventDataSchemaByType["appointment.rescheduled"].safeParse({
        appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
        changes: { notes: "Updated note" },
        previousClientId: null,
        previousNotes: null,
      }).success,
    ).toBe(false);
  });
});

describe("appointment webhook event taxonomy", () => {
  test("accepts only canonical appointment lifecycle event names", () => {
    expect(
      webhookEventTypeSchema.safeParse("appointment.scheduled").success,
    ).toBe(true);
    expect(
      webhookEventTypeSchema.safeParse("appointment.rescheduled").success,
    ).toBe(true);
    expect(
      webhookEventTypeSchema.safeParse("appointment.canceled").success,
    ).toBe(true);
  });

  test("rejects legacy appointment lifecycle aliases", () => {
    expect(
      webhookEventTypeSchema.safeParse("appointment.created").success,
    ).toBe(false);
    expect(
      webhookEventTypeSchema.safeParse("appointment.updated").success,
    ).toBe(false);
    expect(
      webhookEventTypeSchema.safeParse("appointment.deleted").success,
    ).toBe(false);
  });
});

describe("appointment domain event taxonomy", () => {
  test("includes only canonical appointment lifecycle domain event names", () => {
    const appointmentLifecycleEventTypes = domainEventTypes.filter(
      (eventType) => eventType.startsWith("appointment."),
    );

    expect(appointmentLifecycleEventTypes).toEqual([
      "appointment.scheduled",
      "appointment.rescheduled",
      "appointment.canceled",
    ]);
  });

  test("rejects legacy appointment lifecycle aliases", () => {
    expect(domainEventTypeSchema.safeParse("appointment.created").success).toBe(
      false,
    );
    expect(domainEventTypeSchema.safeParse("appointment.updated").success).toBe(
      false,
    );
    expect(domainEventTypeSchema.safeParse("appointment.deleted").success).toBe(
      false,
    );
  });
});
