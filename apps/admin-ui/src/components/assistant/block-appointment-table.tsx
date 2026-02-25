import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DateTime } from "luxon";
import { Calendar02Icon } from "@hugeicons/core-free-icons";
import type { AssistantAppointmentTableRow } from "@scheduling/dto";
import {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/lib/appointment-status";
import { useSetCommandCenterOpen } from "@/hooks/use-command-center";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

interface AppointmentTableBlockProps {
  rows: AssistantAppointmentTableRow[];
}

const PAGE_SIZE = 5;

function formatDateTime(value: string) {
  const date = DateTime.fromISO(value, { setZone: true });
  if (!date.isValid) return value;
  return date.toFormat("LLL d, h:mm a");
}

export function AppointmentTableBlock({ rows }: AppointmentTableBlockProps) {
  const [expanded, setExpanded] = useState(false);
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
    setOpen(false);
    navigate({ to: "/appointments", search: { selected: appointment.id } });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="divide-y divide-border/50">
        {visibleRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => handleRowClick(row)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 active:bg-muted/70"
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
              {formatDateTime(row.startAt)}
            </span>
            <Badge
              variant={getStatusBadgeVariant(row.status)}
              className="shrink-0"
            >
              {formatStatusLabel(row.status)}
            </Badge>
          </button>
        ))}
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
