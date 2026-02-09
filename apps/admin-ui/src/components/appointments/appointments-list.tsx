// Appointments list table component

import { useMemo, useState } from "react";
import type { AppointmentWithRelations } from "@scheduling/dto";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  TimeScheduleIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import {
  EntityCardField,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { RowActions } from "@/components/row-actions";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
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

  const columns = useMemo<ColumnDef<AppointmentWithRelations>[]>(
    () => [
      {
        id: "startAt",
        accessorFn: (row) => {
          const value = row.startAt;
          return typeof value === "string"
            ? new Date(value).getTime()
            : value.getTime();
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date/Time" />
        ),
        cell: ({ row }) => (
          <div className="font-medium">
            <div>
              {formatDisplayDateTime(row.original.startAt, displayTimezone)}
            </div>
            <div className="text-xs text-muted-foreground">
              {timezoneShortLabel}
            </div>
            {row.original.appointmentType?.durationMin && (
              <div className="text-xs text-muted-foreground">
                {row.original.appointmentType.durationMin} min
              </div>
            )}
          </div>
        ),
      },
      {
        id: "type",
        accessorFn: (row) => row.appointmentType?.name ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => row.original.appointmentType?.name ?? "-",
      },
      {
        id: "calendar",
        accessorFn: (row) => row.calendar?.name ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Calendar" />
        ),
        cell: ({ row }) => row.original.calendar?.name ?? "-",
      },
      {
        id: "client",
        accessorFn: (row) =>
          row.client ? `${row.client.firstName} ${row.client.lastName}` : "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Client" />
        ),
        cell: ({ row }) =>
          row.original.client
            ? `${row.original.client.firstName} ${row.original.client.lastName}`
            : "-",
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status)}>
            {row.original.status.replace("_", " ")}
          </Badge>
        ),
      },
    ],
    [displayTimezone, timezoneShortLabel],
  );

  const table = useReactTable({
    data: appointments,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLowerCase();
      if (!query) return true;

      const typeName = row.original.appointmentType?.name ?? "";
      const calendarName = row.original.calendar?.name ?? "";
      const clientName = row.original.client
        ? `${row.original.client.firstName} ${row.original.client.lastName}`
        : "";
      const status = row.original.status;

      return (
        typeName.toLowerCase().includes(query) ||
        calendarName.toLowerCase().includes(query) ||
        clientName.toLowerCase().includes(query) ||
        status.toLowerCase().includes(query)
      );
    },
  });

  if (isLoading) {
    return (
      <div className="py-10" role="status" aria-live="polite">
        <TableSkeleton rows={5} cols={5} />
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
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Icon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Filter appointments..."
          className="pl-10"
        />
      </div>

      {table.getRowModel().rows.length > 0 ? (
        <EntityMobileCardList>
          {table.getRowModel().rows.map((row) => {
            const appointment = row.original;
            const isSelected = appointment.id === selectedId;
            const clientName = appointment.client
              ? `${appointment.client.firstName} ${appointment.client.lastName}`
              : "-";

            return (
              <EntityMobileCard
                key={appointment.id}
                onOpen={() => onSelect(appointment)}
                className={cn(isSelected && "border-primary/50 bg-muted/30")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {appointment.appointmentType?.name ?? "Appointment"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDisplayDateTime(
                        appointment.startAt,
                        displayTimezone,
                      )}{" "}
                      ({timezoneShortLabel})
                    </p>
                  </div>
                  <RowActions
                    ariaLabel={`Actions for appointment ${appointment.id}`}
                    actions={getContextMenuItems(appointment)}
                  />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <EntityCardField label="Client" value={clientName} />
                  <EntityCardField
                    label="Calendar"
                    value={appointment.calendar?.name ?? "-"}
                  />
                  <EntityCardField
                    label="Status"
                    value={
                      <Badge variant={getStatusVariant(appointment.status)}>
                        {appointment.status.replace("_", " ")}
                      </Badge>
                    }
                  />
                </dl>
              </EntityMobileCard>
            );
          })}
        </EntityMobileCardList>
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm md:hidden">
          No appointments match your filters.
        </div>
      )}

      <DataTablePagination
        table={table}
        className="justify-center rounded-xl border border-border bg-card shadow-sm md:hidden"
      />

      <div className="hidden overflow-hidden rounded-xl border border-border shadow-sm md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const isSelected = row.original.id === selectedId;
                return (
                  <ContextMenu
                    key={row.original.id}
                    items={getContextMenuItems(row.original)}
                  >
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        isSelected && "bg-muted/60",
                      )}
                      aria-selected={isSelected}
                      onClick={() => onSelect(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </ContextMenu>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No appointments match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
