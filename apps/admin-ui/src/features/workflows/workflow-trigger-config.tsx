import { useEffect, useMemo, useState } from "react";
import { domainEventTypes } from "@scheduling/dto";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

type TriggerConfigShape = {
  startEvents?: string[];
  restartEvents?: string[];
  stopEvents?: string[];
  domainEventCorrelationPath?: string;
  domainEventMockEvent?: string;
};

interface WorkflowTriggerConfigProps {
  config: Record<string, unknown>;
  disabled: boolean;
  onUpdate: (next: TriggerConfigShape) => void;
}

export function WorkflowTriggerConfig({
  config,
  disabled,
  onUpdate,
}: WorkflowTriggerConfigProps) {
  const [correlationPathValue, setCorrelationPathValue] = useState("");
  const [mockEventValue, setMockEventValue] = useState("");

  useEffect(() => {
    setCorrelationPathValue(
      typeof config.domainEventCorrelationPath === "string"
        ? config.domainEventCorrelationPath
        : "",
    );
    setMockEventValue(
      typeof config.domainEventMockEvent === "string"
        ? config.domainEventMockEvent
        : "",
    );
  }, [config.domainEventCorrelationPath, config.domainEventMockEvent]);

  const overlapWarnings = useMemo(() => {
    const start = new Set(toStringArray(config.startEvents));
    const restart = new Set(toStringArray(config.restartEvents));
    const stop = new Set(toStringArray(config.stopEvents));

    return {
      startRestart: [...start].filter((e) => restart.has(e)),
      startStop: [...start].filter((e) => stop.has(e)),
      restartStop: [...restart].filter((e) => stop.has(e)),
    };
  }, [config.startEvents, config.restartEvents, config.stopEvents]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium text-sm">Domain Event Trigger</h2>
        <p className="text-muted-foreground text-xs">
          Configure which domain events start, restart, or stop workflow runs.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-start-events">Start events</Label>
        <MultiSelectCombobox
          disabled={disabled}
          options={domainEventTypes}
          value={
            Array.isArray(config.startEvents)
              ? (config.startEvents as string[])
              : []
          }
          onChange={(values) => onUpdate({ startEvents: values })}
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-restart-events">Restart events</Label>
        <MultiSelectCombobox
          disabled={disabled}
          options={domainEventTypes}
          value={toStringArray(config.restartEvents)}
          onChange={(values) => onUpdate({ restartEvents: values })}
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-stop-events">Stop events</Label>
        <MultiSelectCombobox
          disabled={disabled}
          options={domainEventTypes}
          value={
            Array.isArray(config.stopEvents)
              ? (config.stopEvents as string[])
              : []
          }
          onChange={(values) => onUpdate({ stopEvents: values })}
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-correlation-path">
          Correlation path
        </Label>
        <Input
          disabled={disabled}
          id="workflow-trigger-correlation-path"
          onBlur={() =>
            onUpdate({
              domainEventCorrelationPath:
                correlationPathValue.trim() || undefined,
            })
          }
          onChange={(event) => {
            setCorrelationPathValue(event.target.value);
          }}
          placeholder="data.appointmentId"
          value={correlationPathValue}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-mock-event">Mock event name</Label>
        <Input
          disabled={disabled}
          id="workflow-trigger-mock-event"
          onBlur={() =>
            onUpdate({
              domainEventMockEvent: mockEventValue.trim() || undefined,
            })
          }
          onChange={(event) => {
            setMockEventValue(event.target.value);
          }}
          placeholder="appointment.created"
          value={mockEventValue}
        />
      </div>

      {overlapWarnings.startRestart.length > 0 ||
      overlapWarnings.startStop.length > 0 ||
      overlapWarnings.restartStop.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {overlapWarnings.startRestart.length > 0 ? (
            <p>
              Shared start/restart events:{" "}
              {overlapWarnings.startRestart.join(", ")}
            </p>
          ) : null}
          {overlapWarnings.startStop.length > 0 ? (
            <p>
              Shared start/stop events: {overlapWarnings.startStop.join(", ")}
            </p>
          ) : null}
          {overlapWarnings.restartStop.length > 0 ? (
            <p>
              Shared restart/stop events:{" "}
              {overlapWarnings.restartStop.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
