// Appointments list table component

import type { AppointmentWithRelations } from "@scheduling/dto";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  TimeScheduleIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { formatDisplayDateTime, formatTimezoneShort } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface AppointmentsListProps {
  appointments: AppointmentWithRelations[];
  displayTimezone: string;
  selectedId: string | null;
  onSelect: (appointment: AppointmentWithRelations) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
  isLoading?: boolean;
}

function getStatusVariant(status: string) {
  switch (status) {
    case "scheduled":
      return "secondary";
    case "confirmed":
      return "success";
    case "cancelled":
      return "destructive";
    case "no_show":
      return "warning";
    default:
      return "secondary";
  }
}

export function AppointmentsList({
  appointments,
  displayTimezone,
  selectedId,
  onSelect,
  onCancel,
  onNoShow,
  isLoading,
}: AppointmentsListProps) {
  const timezoneShortLabel = formatTimezoneShort(displayTimezone);
  const getContextMenuItems = (
    appointment: AppointmentWithRelations,
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => onSelect(appointment),
      },
    ];

    if (
      appointment.status === "scheduled" ||
      appointment.status === "confirmed"
    ) {
      if (appointment.status === "scheduled") {
        items.push({
          label: "Confirm",
          icon: CheckmarkCircle01Icon,
          onClick: () => {
            // Confirm logic placeholder
          },
        });
      }

      items.push({
        label: "Reschedule",
        icon: TimeScheduleIcon,
        onClick: () => {
          // Reschedule logic placeholder
        },
      });

      items.push({
        label: "Mark No-Show",
        icon: Clock01Icon,
        onClick: () => onNoShow(appointment.id),
      });

      items.push({
        label: "Cancel",
        icon: Cancel01Icon,
        onClick: () => onCancel(appointment.id),
        variant: "destructive",
        separator: true,
      });
    }

    return items;
  };

  if (isLoading) {
    return (
      <div
        className="text-center text-muted-foreground py-10"
        role="status"
        aria-live="polite"
      >
        Loading...
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
        No appointments found. Create your first appointment or adjust filters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date/Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Calendar</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((appointment) => {
            const isSelected = appointment.id === selectedId;
            return (
              <ContextMenu
                key={appointment.id}
                items={getContextMenuItems(appointment)}
              >
                <TableRow
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted/60",
                  )}
                  aria-selected={isSelected}
                  onClick={() => onSelect(appointment)}
                >
                  <TableCell className="font-medium">
                    <div>
                      {formatDisplayDateTime(
                        appointment.startAt,
                        displayTimezone,
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {timezoneShortLabel}
                    </div>
                    {appointment.appointmentType?.durationMin && (
                      <div className="text-xs text-muted-foreground">
                        {appointment.appointmentType.durationMin} min
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {appointment.appointmentType?.name ?? "-"}
                  </TableCell>
                  <TableCell>{appointment.calendar?.name ?? "-"}</TableCell>
                  <TableCell>
                    {appointment.client
                      ? `${appointment.client.firstName} ${appointment.client.lastName}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(appointment.status)}>
                      {appointment.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              </ContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
