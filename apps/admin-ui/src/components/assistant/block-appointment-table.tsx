import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DateTime } from "luxon";
import {
  ArrowRight01Icon,
  Calendar02Icon,
  Cancel01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import type { AssistantAppointmentTableRow } from "@scheduling/dto";
import {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/lib/appointment-status";
import { useSetCommandCenterOpen } from "@/hooks/use-command-center";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

export type AppointmentAction = "reschedule" | "cancel" | "open";

interface AppointmentTableBlockProps {
  rows: AssistantAppointmentTableRow[];
  onAction?: (
    row: AssistantAppointmentTableRow,
    action: AppointmentAction,
  ) => void;
  disabled?: boolean;
}

const PAGE_SIZE = 5;

function formatDateTime(value: string, timezone?: string) {
  const date = timezone
    ? DateTime.fromISO(value, { zone: timezone })
    : DateTime.fromISO(value, { setZone: true });
  if (!date.isValid) return value;
  return date.toFormat("LLL d, h:mm a");
}

function formatDateTimeLong(value: string, timezone?: string) {
  const date = timezone
    ? DateTime.fromISO(value, { zone: timezone })
    : DateTime.fromISO(value, { setZone: true });
  if (!date.isValid) return value;
  return date.toFormat("cccc, LLL d 'at' h:mm a");
}

function formatDuration(startAt: string, endAt: string) {
  const start = DateTime.fromISO(startAt);
  const end = DateTime.fromISO(endAt);
  if (!start.isValid || !end.isValid) return null;
  const mins = end.diff(start, "minutes").minutes;
  if (mins <= 0) return null;
  return `${Math.round(mins)} min`;
}

function AppointmentDetailPanel({
  row,
  onAction,
  disabled,
}: {
  row: AssistantAppointmentTableRow;
  onAction?: (
    row: AssistantAppointmentTableRow,
    action: AppointmentAction,
  ) => void;
  disabled?: boolean;
}) {
  const duration = formatDuration(row.startAt, row.endAt);
  const isActionable = row.status === "scheduled" || row.status === "confirmed";

  return (
    <div className="space-y-2.5 border-t border-border/40 bg-muted/20 px-3 py-2.5">
      <div className="space-y-1 text-xs">
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-muted-foreground">
            When:
          </span>
          <span className="text-foreground/80">
            {formatDateTimeLong(row.startAt, row.timezone)}
            {duration ? ` (${duration})` : ""}
          </span>
        </div>
        {row.calendarName ? (
          <div className="flex gap-1.5">
            <span className="shrink-0 font-medium text-muted-foreground">
              Calendar:
            </span>
            <span className="text-foreground/80">{row.calendarName}</span>
          </div>
        ) : null}
        {row.appointmentTypeName ? (
          <div className="flex gap-1.5">
            <span className="shrink-0 font-medium text-muted-foreground">
              Type:
            </span>
            <span className="text-foreground/80">
              {row.appointmentTypeName}
            </span>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-muted-foreground">
            Timezone:
          </span>
          <span className="text-foreground/80">{row.timezone}</span>
        </div>
      </div>
      {onAction ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction(row, "open")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground",
              "transition-colors hover:bg-muted/50 active:bg-muted/70",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Icon icon={ArrowRight01Icon} className="size-3" />
            Open
          </button>
          {isActionable ? (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction(row, "reschedule")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground",
                  "transition-colors hover:bg-muted/50 active:bg-muted/70",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Icon icon={Clock01Icon} className="size-3" />
                Reschedule
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction(row, "cancel")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive",
                  "transition-colors hover:bg-destructive/5 active:bg-destructive/10",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Icon icon={Cancel01Icon} className="size-3" />
                Cancel
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AppointmentTableBlock({
  rows,
  onAction,
  disabled,
}: AppointmentTableBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const setOpen = useSetCommandCenterOpen();

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Icon icon={Calendar02Icon} className="size-3.5 shrink-0" />
        No matching appointments found.
      </div>
    );
  }

  const visibleRows = expanded ? rows : rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  const handleRowClick = (appointment: AssistantAppointmentTableRow) => {
    if (onAction) {
      if (disabled) return;
      setSelectedId((prev) =>
        prev === appointment.id ? null : appointment.id,
      );
    } else {
      setOpen(false);
      navigate({ to: "/appointments", search: { selected: appointment.id } });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="divide-y divide-border/50">
        {visibleRows.map((row) => {
          const isSelected = onAction && selectedId === row.id;
          return (
            <div key={row.id}>
              <button
                type="button"
                disabled={onAction ? disabled : false}
                onClick={() => handleRowClick(row)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors",
                  isSelected
                    ? "border-l-2 border-l-primary bg-primary/10"
                    : "hover:bg-muted/50 active:bg-muted/70",
                  onAction && disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {row.clientName}
                  </div>
                  {(row.calendarName || row.appointmentTypeName) && (
                    <div className="truncate text-muted-foreground">
                      {[row.calendarName, row.appointmentTypeName]
                        .filter(Boolean)
                        .join(" \u00b7 ")}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {formatDateTime(row.startAt, row.timezone)}
                </span>
                <Badge
                  variant={getStatusBadgeVariant(row.status)}
                  className="shrink-0"
                >
                  {formatStatusLabel(row.status)}
                </Badge>
              </button>
              {isSelected ? (
                <AppointmentDetailPanel
                  row={row}
                  onAction={onAction}
                  disabled={disabled}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {hasMore ? (
        <div className="border-t border-border/50 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Show less" : `Show all ${rows.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
