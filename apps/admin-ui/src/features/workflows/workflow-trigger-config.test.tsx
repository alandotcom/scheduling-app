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

  test("re-syncs correlation input when config changes", () => {
    const onUpdate = mock(() => {});

    const view = render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          domainEventCorrelationPath: "data.firstId",
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const correlationInput = screen.getByLabelText(
      "Correlation path",
    ) as HTMLInputElement;

    fireEvent.change(correlationInput, {
      target: { value: "unsaved.first" },
    });

    view.rerender(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          domainEventCorrelationPath: "data.secondId",
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const switchedCorrelationInput = screen.getByLabelText(
      "Correlation path",
    ) as HTMLInputElement;

    expect(switchedCorrelationInput.value).toBe("data.secondId");

    fireEvent.blur(switchedCorrelationInput);

    expect(onUpdate).toHaveBeenCalledWith({
      domainEventCorrelationPath: "data.secondId",
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
