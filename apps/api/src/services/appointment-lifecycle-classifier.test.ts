import { describe, expect, test } from "bun:test";
import {
  classifyAppointmentLifecycleEvent,
  type AppointmentLifecycleSnapshot,
} from "./appointment-lifecycle-classifier.js";

function createSnapshot(
  overrides: Partial<AppointmentLifecycleSnapshot> = {},
): AppointmentLifecycleSnapshot {
  return {
    appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
    calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
    appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d23",
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
    startAt: "2026-05-01T15:00:00.000Z",
    endAt: "2026-05-01T15:30:00.000Z",
    timezone: "America/New_York",
    status: "scheduled",
    notes: null,
    appointment: {
      id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d23",
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
      startAt: "2026-05-01T15:00:00.000Z",
      endAt: "2026-05-01T15:30:00.000Z",
      timezone: "America/New_York",
      status: "scheduled",
      notes: null,
    },
    client: {
      id: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      customAttributes: {},
    },
    ...overrides,
  };
}

describe("classifyAppointmentLifecycleEvent", () => {
  test("classifies create mutations as appointment.scheduled", () => {
    const current = createSnapshot();

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      current,
      previous: null,
    });

    expect(lifecycleEvent).toEqual({
      type: "appointment.scheduled",
      payload: current,
    });
  });

  test("classifies start time changes as appointment.rescheduled", () => {
    const previous = createSnapshot();
    const current = createSnapshot({
      startAt: "2026-05-02T15:00:00.000Z",
      endAt: "2026-05-02T15:30:00.000Z",
    });

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      previous,
      current,
    });

    expect(lifecycleEvent).toEqual({
      type: "appointment.rescheduled",
      payload: {
        ...current,
        previous,
      },
    });
  });

  test("classifies timezone changes as appointment.rescheduled", () => {
    const previous = createSnapshot({ timezone: "UTC" });
    const current = createSnapshot({ timezone: "America/Chicago" });

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      previous,
      current,
    });

    expect(lifecycleEvent).toEqual({
      type: "appointment.rescheduled",
      payload: {
        ...current,
        previous,
      },
    });
  });

  test("classifies cancel transitions as appointment.canceled", () => {
    const previous = createSnapshot({ status: "scheduled" });
    const current = createSnapshot({ status: "cancelled" });

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      previous,
      current,
    });

    expect(lifecycleEvent).toEqual({
      type: "appointment.canceled",
      payload: current,
    });
  });

  test("classifies confirm transitions as appointment.confirmed", () => {
    const previous = createSnapshot({ status: "scheduled" });
    const current = createSnapshot({ status: "confirmed" });

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      previous,
      current,
    });

    expect(lifecycleEvent).toEqual({
      type: "appointment.confirmed",
      payload: current,
    });
  });

  test("returns null for non-lifecycle updates", () => {
    const previous = createSnapshot({ notes: "Initial note" });
    const current = createSnapshot({ notes: "Updated note" });

    const lifecycleEvent = classifyAppointmentLifecycleEvent({
      previous,
      current,
    });

    expect(lifecycleEvent).toBeNull();
  });
});
