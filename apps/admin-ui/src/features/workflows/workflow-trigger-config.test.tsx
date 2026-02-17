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
    fireEvent.click(screen.getByText("appointment.scheduled"));

    expect(onUpdate).toHaveBeenCalledWith({
      startEvents: ["appointment.scheduled"],
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
          restartEvents: ["appointment.rescheduled"],
          stopEvents: ["appointment.canceled"],
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByLabelText("Remove client.created")).toBeNull();
  });

  test("edits grouped trigger filters and emits AST updates", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          startEvents: ["appointment.scheduled"],
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add condition" })[0]!,
    );

    const fieldInput = screen.getAllByPlaceholderText(
      "appointment.startAt",
    )[0]!;
    fireEvent.change(fieldInput, {
      target: { value: "appointment.startAt" },
    });

    expect(onUpdate).toHaveBeenCalled();
  });

  test("prevents adding more than four filter groups", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          startEvents: ["appointment.scheduled"],
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));

    expect(screen.getByText("You can add at most 4 groups.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("prevents adding more than twelve filter conditions", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          triggerType: "DomainEvent",
          domain: "appointment",
          startEvents: ["appointment.scheduled"],
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add condition" })[0]!,
    );

    expect(screen.getByText("You can add at most 12 conditions.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });
});
