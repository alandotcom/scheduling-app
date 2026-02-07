// Appointment history/audit log component

import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import {
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  TimeScheduleIcon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { formatDisplayDateTime, formatRelativeTime } from "@/lib/date-utils";
import { Icon } from "@/components/ui/icon";

interface AppointmentHistoryProps {
  appointmentId: string;
}

export function AppointmentHistory({ appointmentId }: AppointmentHistoryProps) {
  const { data, isLoading } = useQuery(
    orpc.audit.list.queryOptions({
      input: {
        entityType: "appointment",
        entityId: appointmentId,
        limit: 50,
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading history...</div>
    );
  }

  const events = data?.items ?? [];

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
        No history available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-3 text-sm border-b border-border/30 pb-4 last:border-0"
        >
          <div className="shrink-0 mt-0.5">
            <ActionIcon action={event.action} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              <ActionDescription
                action={event.action}
                actorName={event.actor?.name}
              />
            </div>
            <MaybeRescheduleChange
              action={event.action}
              before={event.before}
              after={event.after}
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {formatRelativeTime(event.createdAt)}
              {event.actor?.name && ` · ${event.actor.name}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  switch (action) {
    case "create":
      return (
        <div className="size-6 rounded-full bg-green-500/10 flex items-center justify-center">
          <Icon
            icon={CheckmarkCircle01Icon}
            className="size-3.5 text-green-600"
          />
        </div>
      );
    case "reschedule":
      return (
        <div className="size-6 rounded-full bg-blue-500/10 flex items-center justify-center">
          <Icon icon={TimeScheduleIcon} className="size-3.5 text-blue-600" />
        </div>
      );
    case "cancel":
      return (
        <div className="size-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <Icon icon={Cancel01Icon} className="size-3.5 text-red-600" />
        </div>
      );
    case "no_show":
      return (
        <div className="size-6 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Icon icon={Clock01Icon} className="size-3.5 text-amber-600" />
        </div>
      );
    default:
      return (
        <div className="size-6 rounded-full bg-muted flex items-center justify-center">
          <Icon
            icon={Calendar03Icon}
            className="size-3.5 text-muted-foreground"
          />
        </div>
      );
  }
}

function ActionDescription({
  action,
  actorName,
}: {
  action: string;
  actorName?: string | null;
}) {
  const name = actorName || "System";
  switch (action) {
    case "create":
      return `Appointment created by ${name}`;
    case "update":
      return `Appointment updated by ${name}`;
    case "reschedule":
      return `Rescheduled by ${name}`;
    case "cancel":
      return `Cancelled by ${name}`;
    case "no_show":
      return `Marked as no-show by ${name}`;
    default:
      return `${action} by ${name}`;
  }
}

function MaybeRescheduleChange({
  action,
  before,
  after,
}: {
  action: string;
  before: unknown;
  after: unknown;
}) {
  if (action !== "reschedule" || !before || !after) {
    return null;
  }

  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const oldStart = beforeRecord.startAt as string | undefined;
  const newStart = afterRecord.startAt as string | undefined;

  if (!oldStart || !newStart) return null;

  const oldDate = DateTime.fromISO(oldStart, { setZone: true });
  const newDate = DateTime.fromISO(newStart, { setZone: true });

  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {formatDisplayDateTime(oldDate)} → {formatDisplayDateTime(newDate)}
    </div>
  );
}
