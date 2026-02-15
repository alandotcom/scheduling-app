import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkflowTriggerConfig } from "./workflow-trigger-config";

afterEach(() => {
  cleanup();
});

describe("WorkflowTriggerConfig", () => {
  test("calls onUpdate when selecting an event from the combobox", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          startEvents: [],
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const inputs = screen.getAllByPlaceholderText("Select events...");
    const startEventsInput = inputs[0]!;

    fireEvent.focus(startEventsInput);
    fireEvent.click(screen.getByText("appointment.created"));

    expect(onUpdate).toHaveBeenCalledWith({
      startEvents: ["appointment.created"],
    });
  });

  test("re-syncs correlation and mock inputs when config changes", () => {
    const onUpdate = mock(() => {});

    const view = render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
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
          domain: "appointment",
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

  test("filters displayed routing events to the selected domain", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          startEvents: ["client.created"],
          restartEvents: ["appointment.updated"],
          stopEvents: ["appointment.deleted"],
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByLabelText("Remove client.created")).toBeNull();
  });
});
