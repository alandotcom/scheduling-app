import { useEffect, useMemo, useState } from "react";
import { domainEventTypes } from "@scheduling/dto";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DOMAIN_EVENT_TYPE_MAP: Record<string, true> = Object.fromEntries(
  domainEventTypes.map((eventType) => [eventType, true]),
);

type TriggerConfigShape = {
  startEvents?: string[];
  restartEvents?: string[];
  stopEvents?: string[];
  domainEventCorrelationPath?: string;
  domainEventMockEvent?: string;
};

type TriggerConfigFieldKey = "startEvents" | "restartEvents" | "stopEvents";

export function parseDomainEventInput(value: string): {
  values: string[];
  invalid: string[];
} {
  const values = [...new Set(value.split(/[\n,]/).map((item) => item.trim()))]
    .filter((item) => item.length > 0)
    .toSorted((left, right) => left.localeCompare(right));

  const invalid = values.filter((item) => !DOMAIN_EVENT_TYPE_MAP[item]);

  return { values, invalid };
}

function toInputValue(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

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
  const [startEventsValue, setStartEventsValue] = useState("");
  const [restartEventsValue, setRestartEventsValue] = useState("");
  const [stopEventsValue, setStopEventsValue] = useState("");
  const [eventErrors, setEventErrors] = useState<
    Partial<Record<TriggerConfigFieldKey, string>>
  >({});

  useEffect(() => {
    setStartEventsValue(toInputValue(config.startEvents));
    setRestartEventsValue(toInputValue(config.restartEvents));
    setStopEventsValue(toInputValue(config.stopEvents));
  }, [config.restartEvents, config.startEvents, config.stopEvents]);

  const overlapWarnings = useMemo(() => {
    const start = new Set(parseDomainEventInput(startEventsValue).values);
    const restart = new Set(parseDomainEventInput(restartEventsValue).values);
    const stop = new Set(parseDomainEventInput(stopEventsValue).values);

    const startRestart = [...start].filter((eventType) =>
      restart.has(eventType),
    );
    const startStop = [...start].filter((eventType) => stop.has(eventType));
    const restartStop = [...restart].filter((eventType) => stop.has(eventType));

    return {
      startRestart,
      startStop,
      restartStop,
    };
  }, [restartEventsValue, startEventsValue, stopEventsValue]);

  function commitRoutingSet(field: TriggerConfigFieldKey, value: string) {
    const parsed = parseDomainEventInput(value);

    if (parsed.invalid.length > 0) {
      setEventErrors((current) => ({
        ...current,
        [field]: `Unknown event type: ${parsed.invalid[0]}`,
      }));
      return;
    }

    setEventErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });

    onUpdate({ [field]: parsed.values });
  }

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
        <Textarea
          disabled={disabled}
          id="workflow-trigger-start-events"
          onBlur={(event) =>
            commitRoutingSet("startEvents", event.target.value)
          }
          onChange={(event) => setStartEventsValue(event.target.value)}
          placeholder="appointment.created, appointment.confirmed"
          rows={3}
          value={startEventsValue}
        />
        {eventErrors.startEvents ? (
          <p className="text-destructive text-xs">{eventErrors.startEvents}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-restart-events">Restart events</Label>
        <Textarea
          disabled={disabled}
          id="workflow-trigger-restart-events"
          onBlur={(event) =>
            commitRoutingSet("restartEvents", event.target.value)
          }
          onChange={(event) => setRestartEventsValue(event.target.value)}
          placeholder="appointment.rescheduled"
          rows={3}
          value={restartEventsValue}
        />
        {eventErrors.restartEvents ? (
          <p className="text-destructive text-xs">
            {eventErrors.restartEvents}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-stop-events">Stop events</Label>
        <Textarea
          disabled={disabled}
          id="workflow-trigger-stop-events"
          onBlur={(event) => commitRoutingSet("stopEvents", event.target.value)}
          onChange={(event) => setStopEventsValue(event.target.value)}
          placeholder="appointment.cancelled"
          rows={3}
          value={stopEventsValue}
        />
        {eventErrors.stopEvents ? (
          <p className="text-destructive text-xs">{eventErrors.stopEvents}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-correlation-path">
          Correlation path
        </Label>
        <Input
          disabled={disabled}
          id="workflow-trigger-correlation-path"
          onBlur={(event) =>
            onUpdate({
              domainEventCorrelationPath:
                event.target.value.trim() || undefined,
            })
          }
          defaultValue={
            typeof config.domainEventCorrelationPath === "string"
              ? config.domainEventCorrelationPath
              : ""
          }
          placeholder="data.appointmentId"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-mock-event">Mock event name</Label>
        <Input
          disabled={disabled}
          id="workflow-trigger-mock-event"
          onBlur={(event) =>
            onUpdate({
              domainEventMockEvent: event.target.value.trim() || undefined,
            })
          }
          defaultValue={
            typeof config.domainEventMockEvent === "string"
              ? config.domainEventMockEvent
              : ""
          }
          placeholder="appointment.created"
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

      <p className="text-muted-foreground text-xs">
        Available event types: {domainEventTypes.join(", ")}
      </p>
    </section>
  );
}
