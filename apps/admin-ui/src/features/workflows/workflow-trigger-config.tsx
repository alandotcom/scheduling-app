import { useEffect, useMemo, useState } from "react";
import {
  domainEventDomains,
  domainEventTypesByDomain,
  type DomainEventDomain,
} from "@scheduling/dto";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

type TriggerConfigShape = {
  domain?: DomainEventDomain;
  startEvents?: string[];
  restartEvents?: string[];
  stopEvents?: string[];
  domainEventCorrelationPath?: string;
};

function isDomainEventDomain(value: unknown): value is DomainEventDomain {
  return (
    typeof value === "string" &&
    domainEventDomains.some((domain) => domain === value)
  );
}

function toDomainLabel(domain: DomainEventDomain): string {
  return domain
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function getSelectedDomain(config: Record<string, unknown>): DomainEventDomain {
  return isDomainEventDomain(config.domain) ? config.domain : "appointment";
}

function filterEventsToDomain(
  values: string[],
  domain: DomainEventDomain,
): string[] {
  const allowed = new Set<string>(domainEventTypesByDomain[domain]);
  return values.filter((value) => allowed.has(value));
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
  const selectedDomain = getSelectedDomain(config);
  const domainEvents = domainEventTypesByDomain[selectedDomain];

  const [correlationPathValue, setCorrelationPathValue] = useState("");

  useEffect(() => {
    setCorrelationPathValue(
      typeof config.domainEventCorrelationPath === "string"
        ? config.domainEventCorrelationPath
        : "",
    );
  }, [config.domainEventCorrelationPath]);

  const overlapWarnings = useMemo(() => {
    const start = new Set(
      filterEventsToDomain(toStringArray(config.startEvents), selectedDomain),
    );
    const restart = new Set(
      filterEventsToDomain(toStringArray(config.restartEvents), selectedDomain),
    );
    const stop = new Set(
      filterEventsToDomain(toStringArray(config.stopEvents), selectedDomain),
    );

    return {
      startRestart: [...start].filter((e) => restart.has(e)),
      startStop: [...start].filter((e) => stop.has(e)),
      restartStop: [...restart].filter((e) => stop.has(e)),
    };
  }, [
    config.startEvents,
    config.restartEvents,
    config.stopEvents,
    selectedDomain,
  ]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium text-sm">Domain Event Trigger</h2>
        <p className="text-muted-foreground text-xs">
          Configure which domain events start, restart, or stop workflow runs.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-domain">Domain</Label>
        <Select
          disabled={disabled}
          value={selectedDomain}
          onValueChange={(nextDomain) => {
            if (!isDomainEventDomain(nextDomain)) {
              return;
            }

            onUpdate({
              domain: nextDomain,
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            });
          }}
        >
          <SelectTrigger id="workflow-trigger-domain" size="sm">
            <SelectValue placeholder="Select domain" />
          </SelectTrigger>
          <SelectContent>
            {domainEventDomains.map((domain) => (
              <SelectItem key={domain} value={domain}>
                {toDomainLabel(domain)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-start-events">Start events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-start-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.startEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              startEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-restart-events">Restart events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-restart-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.restartEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              restartEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-stop-events">Stop events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-stop-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.stopEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              stopEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
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
