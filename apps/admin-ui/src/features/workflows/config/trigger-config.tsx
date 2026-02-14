import { useEffect, useMemo, useState } from "react";
import type { WorkflowTriggerCatalogItem } from "@scheduling/dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TriggerConfigProps = {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  triggerCatalog: WorkflowTriggerCatalogItem[];
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  }

  return [];
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

type EventMultiSelectProps = {
  label: string;
  options: string[];
  selected: string[];
  emptyLabel: string;
  onChange: (next: string[]) => void;
};

function EventMultiSelect({
  label,
  options,
  selected,
  emptyLabel,
  onChange,
}: EventMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options.filter((option) =>
      option.toLowerCase().includes(normalized),
    );
  }, [options, query]);

  const summary = useMemo(() => {
    if (selected.length === 0) {
      return emptyLabel;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    if (selected.length === 2) {
      return `${selected[0]}, ${selected[1]}`;
    }
    return `${selected.length} selected`;
  }, [emptyLabel, selected]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          render={
            <Button
              className="h-11 w-full justify-between"
              type="button"
              variant="outline"
            />
          }
        >
          <span className="truncate text-left">{summary}</span>
          <Badge variant="secondary">{selected.length}</Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--anchor-width)] p-2"
        >
          <Input
            placeholder="Filter events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No events found.
              </p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option);
                return (
                  <button
                    key={option}
                    className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange(
                        checked
                          ? selected.filter((entry) => entry !== option)
                          : [...selected, option],
                      );
                    }}
                    type="button"
                  >
                    <span className="truncate">{option}</span>
                    <span
                      aria-hidden="true"
                      className={
                        checked
                          ? "inline-flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary text-[10px] font-semibold text-primary-foreground"
                          : "inline-flex h-4 w-4 items-center justify-center rounded border border-border"
                      }
                    >
                      {checked ? "✓" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TriggerConfig({
  config,
  onChange,
  triggerCatalog,
}: TriggerConfigProps) {
  const triggerType =
    typeof config.triggerType === "string" ? config.triggerType : "Webhook";
  const domainTriggers = useMemo(
    () =>
      triggerCatalog
        .filter(
          (
            trigger,
          ): trigger is Extract<
            WorkflowTriggerCatalogItem,
            { type: "domain_event" }
          > => trigger.type === "domain_event",
        )
        .toSorted((left, right) => left.domain.localeCompare(right.domain)),
    [triggerCatalog],
  );
  const scheduleTrigger = useMemo(
    () =>
      triggerCatalog.find(
        (
          trigger,
        ): trigger is Extract<
          WorkflowTriggerCatalogItem,
          { type: "schedule" }
        > => trigger.type === "schedule",
      ) ?? null,
    [triggerCatalog],
  );

  const configuredDomain =
    typeof config.domain === "string" ? config.domain : "";
  const resolvedDomainTrigger = useMemo(() => {
    if (configuredDomain) {
      const matched = domainTriggers.find(
        (trigger) => trigger.domain === configuredDomain,
      );
      if (matched) {
        return matched;
      }
    }

    return domainTriggers[0] ?? null;
  }, [configuredDomain, domainTriggers]);

  const currentDomain = resolvedDomainTrigger?.domain ?? "appointment";
  const domainEvents = (resolvedDomainTrigger?.events ?? []) as string[];
  const startEvents = toStringArray(config.webhookCreateEvents);
  const restartEvents = toStringArray(config.webhookUpdateEvents);
  const stopEvents = toStringArray(config.webhookDeleteEvents);

  const normalizedStartEvents = useMemo(
    () => startEvents.filter((event) => domainEvents.includes(event)),
    [domainEvents, startEvents],
  );
  const normalizedRestartEvents = useMemo(
    () => restartEvents.filter((event) => domainEvents.includes(event)),
    [domainEvents, restartEvents],
  );
  const normalizedStopEvents = useMemo(
    () => stopEvents.filter((event) => domainEvents.includes(event)),
    [domainEvents, stopEvents],
  );

  useEffect(() => {
    if (triggerType !== "Webhook") {
      return;
    }

    if (
      configuredDomain !== currentDomain ||
      !arraysEqual(startEvents, normalizedStartEvents) ||
      !arraysEqual(restartEvents, normalizedRestartEvents) ||
      !arraysEqual(stopEvents, normalizedStopEvents)
    ) {
      onChange({
        ...config,
        triggerType: "Webhook",
        domain: currentDomain,
        webhookCreateEvents: normalizedStartEvents,
        webhookUpdateEvents: normalizedRestartEvents,
        webhookDeleteEvents: normalizedStopEvents,
      });
    }
  }, [
    config,
    configuredDomain,
    currentDomain,
    normalizedRestartEvents,
    normalizedStartEvents,
    normalizedStopEvents,
    onChange,
    restartEvents,
    startEvents,
    stopEvents,
    triggerType,
  ]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Trigger type</Label>
        <Select
          items={[
            { value: "Webhook", label: "Webhook" },
            { value: "Schedule", label: scheduleTrigger?.label ?? "Schedule" },
          ]}
          value={triggerType}
          onValueChange={(value) => {
            if (value === "Schedule") {
              onChange({
                ...config,
                triggerType: "Schedule",
                scheduleExpression:
                  typeof config.scheduleExpression === "string"
                    ? config.scheduleExpression
                    : "",
                scheduleCron:
                  typeof config.scheduleCron === "string"
                    ? config.scheduleCron
                    : "",
                scheduleTimezone:
                  typeof config.scheduleTimezone === "string"
                    ? config.scheduleTimezone
                    : (scheduleTrigger?.defaultTimezone ?? "America/New_York"),
              });
              return;
            }

            onChange({
              ...config,
              triggerType: "Webhook",
              domain: currentDomain,
              webhookCreateEvents:
                resolvedDomainTrigger?.defaultStartEvents ??
                normalizedStartEvents,
              webhookUpdateEvents:
                resolvedDomainTrigger?.defaultRestartEvents ??
                normalizedRestartEvents,
              webhookDeleteEvents:
                resolvedDomainTrigger?.defaultStopEvents ??
                normalizedStopEvents,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select trigger" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Webhook">Webhook</SelectItem>
            <SelectItem value="Schedule">
              {scheduleTrigger?.label ?? "Schedule"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {triggerType === "Schedule" ? (
        <>
          <div className="space-y-1.5">
            <Label>Cron expression</Label>
            <Input
              value={
                typeof config.scheduleExpression === "string"
                  ? config.scheduleExpression
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  scheduleExpression: event.target.value,
                  scheduleCron: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input
              value={
                typeof config.scheduleTimezone === "string"
                  ? config.scheduleTimezone
                  : (scheduleTrigger?.defaultTimezone ?? "America/New_York")
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  scheduleTimezone: event.target.value,
                })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <Select
              items={domainTriggers.map((trigger) => ({
                value: trigger.domain,
                label: trigger.domain,
              }))}
              value={currentDomain}
              onValueChange={(nextDomain) => {
                const selectedDomain = domainTriggers.find(
                  (trigger) => trigger.domain === nextDomain,
                );
                if (!selectedDomain) {
                  return;
                }

                onChange({
                  ...config,
                  domain: nextDomain,
                  webhookCreateEvents: normalizedStartEvents.filter((event) =>
                    (selectedDomain.events as string[]).includes(event),
                  ),
                  webhookUpdateEvents: normalizedRestartEvents.filter((event) =>
                    (selectedDomain.events as string[]).includes(event),
                  ),
                  webhookDeleteEvents: normalizedStopEvents.filter((event) =>
                    (selectedDomain.events as string[]).includes(event),
                  ),
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {domainTriggers.map((trigger) => (
                  <SelectItem key={trigger.domain} value={trigger.domain}>
                    {trigger.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <EventMultiSelect
            emptyLabel="Select start events"
            label="Start events"
            options={domainEvents}
            selected={normalizedStartEvents}
            onChange={(next) =>
              onChange({
                ...config,
                webhookCreateEvents: next,
              })
            }
          />
          <EventMultiSelect
            emptyLabel="Select restart events"
            label="Restart events"
            options={domainEvents}
            selected={normalizedRestartEvents}
            onChange={(next) =>
              onChange({
                ...config,
                webhookUpdateEvents: next,
              })
            }
          />
          <EventMultiSelect
            emptyLabel="Select stop events"
            label="Stop events"
            options={domainEvents}
            selected={normalizedStopEvents}
            onChange={(next) =>
              onChange({
                ...config,
                webhookDeleteEvents: next,
              })
            }
          />
        </>
      )}
    </div>
  );
}
