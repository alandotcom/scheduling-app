import { describe, expect, test } from "bun:test";
import { buildEventAttributeSuggestions } from "./event-attribute-suggestions";

describe("buildEventAttributeSuggestions", () => {
  test("hides ID paths in general mode", () => {
    const values = new Set(
      buildEventAttributeSuggestions({
        domain: "appointment",
        eventTypes: ["appointment.scheduled"],
        mode: "general",
      }).map((suggestion) => suggestion.value),
    );

    expect(values.has("Appointment.data.appointmentId")).toBeFalse();
    expect(values.has("Appointment.data.clientId")).toBeFalse();
    expect(values.has("Appointment.data.appointment.id")).toBeFalse();
    expect(values.has("Appointment.data.client.id")).toBeFalse();
    expect(values.has("Appointment.data.startAt")).toBeTrue();
    expect(values.has("Appointment.data.appointment.startAt")).toBeTrue();
    expect(values.has("Appointment.data.client.firstName")).toBeTrue();
  });

  test("keeps ID paths in condition mode", () => {
    const values = new Set(
      buildEventAttributeSuggestions({
        domain: "appointment",
        eventTypes: ["appointment.scheduled"],
        mode: "condition",
      }).map((suggestion) => suggestion.value),
    );

    expect(values.has("Appointment.data.appointmentId")).toBeTrue();
    expect(values.has("Appointment.data.clientId")).toBeTrue();
    expect(values.has("Appointment.data.appointment.id")).toBeTrue();
    expect(values.has("Appointment.data.client.id")).toBeTrue();
  });

  test("uses client custom attribute paths for client domain suggestions", () => {
    const values = new Set(
      buildEventAttributeSuggestions({
        domain: "client",
        eventTypes: ["client.created"],
        mode: "condition",
        customAttributeDefinitions: [
          {
            fieldKey: "plan",
            type: "TEXT",
          },
        ],
      }).map((suggestion) => suggestion.value),
    );

    expect(values.has("Client.data.customAttributes.plan")).toBeTrue();
    expect(values.has("Client.data.client.customAttributes.plan")).toBeFalse();
  });
});
