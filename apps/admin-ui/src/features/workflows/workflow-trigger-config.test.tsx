import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  WorkflowTriggerConfig,
  parseDomainEventInput,
} from "./workflow-trigger-config";

afterEach(() => {
  cleanup();
});

describe("parseDomainEventInput", () => {
  test("returns unknown event types as invalid", () => {
    const parsed = parseDomainEventInput("appointment.created,invalid.event");

    expect(parsed.values).toEqual(["appointment.created", "invalid.event"]);
    expect(parsed.invalid).toEqual(["invalid.event"]);
  });
});

describe("WorkflowTriggerConfig", () => {
  test("shows validation error and blocks save for invalid event type", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{ triggerType: "DomainEvent" }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const startEventsInput = screen.getByLabelText(
      "Start events",
    ) as HTMLTextAreaElement;

    fireEvent.change(startEventsInput, {
      target: { value: "invalid.event" },
    });
    fireEvent.blur(startEventsInput);

    expect(screen.getByText("Unknown event type: invalid.event")).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("commits valid event routing set on blur", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{ triggerType: "DomainEvent" }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const startEventsInput = screen.getByLabelText(
      "Start events",
    ) as HTMLTextAreaElement;

    fireEvent.change(startEventsInput, {
      target: { value: "appointment.updated, appointment.created" },
    });
    fireEvent.blur(startEventsInput);

    expect(onUpdate).toHaveBeenCalledWith({
      startEvents: ["appointment.created", "appointment.updated"],
    });
  });

  test("re-syncs correlation and mock inputs when config changes", () => {
    const onUpdate = mock(() => {});

    const view = render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domainEventCorrelationPath: "data.firstId",
          domainEventMockEvent: "appointment.created",
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const correlationInput = screen.getByLabelText(
      "Correlation path",
    ) as HTMLInputElement;
    const mockEventInput = screen.getByLabelText(
      "Mock event name",
    ) as HTMLInputElement;

    fireEvent.change(correlationInput, {
      target: { value: "unsaved.first" },
    });
    fireEvent.change(mockEventInput, {
      target: { value: "unsaved.event" },
    });

    view.rerender(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domainEventCorrelationPath: "data.secondId",
          domainEventMockEvent: "appointment.updated",
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const switchedCorrelationInput = screen.getByLabelText(
      "Correlation path",
    ) as HTMLInputElement;
    const switchedMockEventInput = screen.getByLabelText(
      "Mock event name",
    ) as HTMLInputElement;

    expect(switchedCorrelationInput.value).toBe("data.secondId");
    expect(switchedMockEventInput.value).toBe("appointment.updated");

    fireEvent.blur(switchedCorrelationInput);
    fireEvent.blur(switchedMockEventInput);

    expect(onUpdate).toHaveBeenCalledWith({
      domainEventCorrelationPath: "data.secondId",
    });
    expect(onUpdate).toHaveBeenCalledWith({
      domainEventMockEvent: "appointment.updated",
    });
  });
});
