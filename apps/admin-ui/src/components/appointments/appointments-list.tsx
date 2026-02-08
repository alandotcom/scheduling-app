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
  EntityCardField,
  EntityDesktopTable,
  EntityListEmptyState,
  EntityListLoadingState,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { RowActions } from "@/components/row-actions";
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
    return <EntityListLoadingState rows={5} cols={5} />;
  }

  if (appointments.length === 0) {
    return (
      <EntityListEmptyState>
        No appointments found. Create your first appointment or adjust filters.
      </EntityListEmptyState>
    );
  }

  return (
    <>
      <EntityMobileCardList>
        {appointments.map((appointment) => {
          const isSelected = appointment.id === selectedId;
          return (
            <EntityMobileCard
              key={appointment.id}
              onOpen={() => onSelect(appointment)}
              className={cn(isSelected && "bg-muted/50")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {formatDisplayDateTime(
                      appointment.startAt,
                      displayTimezone,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {timezoneShortLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(appointment.status)}>
                    {appointment.status.replace("_", " ")}
                  </Badge>
                  <RowActions
                    ariaLabel={`Actions for appointment ${appointment.id}`}
                    actions={getContextMenuItems(appointment)}
                  />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Type"
                  value={appointment.appointmentType?.name ?? "-"}
                />
                <EntityCardField
                  label="Calendar"
                  value={appointment.calendar?.name ?? "-"}
                />
                <EntityCardField
                  label="Client"
                  value={
                    appointment.client
                      ? `${appointment.client.firstName} ${appointment.client.lastName}`
                      : "-"
                  }
                  className="col-span-2"
                />
              </dl>
            </EntityMobileCard>
          );
        })}
      </EntityMobileCardList>

      <EntityDesktopTable>
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
      </EntityDesktopTable>
    </>
  );
}
