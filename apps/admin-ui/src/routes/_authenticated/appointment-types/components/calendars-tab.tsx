// Calendars tab for linking calendars to appointment types

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { formatTimezoneShort } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/query";

interface CalendarsTabProps {
  appointmentTypeId: string;
  onAddCalendar: (calendarId: string) => void;
  onRemoveCalendar: (calendarId: string) => void;
  isAddPending: boolean;
  isRemovePending: boolean;
}

interface LinkedCalendarRow {
  calendarId: string;
  calendar: {
    id: string;
    name: string;
    timezone: string;
  };
}

export function CalendarsTab({
  appointmentTypeId,
  onAddCalendar,
  onRemoveCalendar,
  isAddPending,
  isRemovePending,
}: CalendarsTabProps) {
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Fetch linked calendars for this type
  const { data: linkedCalendarsData } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId },
    }),
    enabled: !!appointmentTypeId,
  });

  // Fetch all calendars for dropdown
  const { data: allCalendarsData } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!appointmentTypeId,
  });

  const linkedCalendars = linkedCalendarsData ?? [];

  // Memoize derived state
  const availableCalendars = useMemo(() => {
    const linkedCalendarIds = new Set(linkedCalendars.map((c) => c.calendarId));
    return (
      allCalendarsData?.items.filter(
        (calendar) => !linkedCalendarIds.has(calendar.id),
      ) ?? []
    );
  }, [linkedCalendars, allCalendarsData?.items]);
  const selectedCalendarLabel = resolveSelectValueLabel({
    value: selectedCalendarId,
    options: availableCalendars,
    getOptionValue: (calendar) => calendar.id,
    getOptionLabel: (calendar) => calendar.name,
    unknownLabel: "Unknown calendar",
  });

  const columns = useMemo<ColumnDef<LinkedCalendarRow>[]>(
    () => [
      {
        id: "calendar",
        accessorFn: (row) => row.calendar.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Calendar" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.calendar.name}</span>
        ),
      },
      {
        id: "timezone",
        accessorFn: (row) => row.calendar.timezone,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Timezone" />
        ),
        cell: ({ row }) => (
          <span title={row.original.calendar.timezone}>
            {formatTimezoneShort(row.original.calendar.timezone)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemoveCalendar(row.original.calendarId)}
            disabled={isRemovePending}
          >
            <Icon icon={Delete01Icon} />
          </Button>
        ),
      },
    ],
    [isRemovePending, onRemoveCalendar],
  );

  const table = useReactTable({
    data: linkedCalendars,
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

      return (
        row.original.calendar.name.toLowerCase().includes(query) ||
        row.original.calendar.timezone.toLowerCase().includes(query)
      );
    },
  });

  const handleAdd = () => {
    if (!selectedCalendarId) return;
    onAddCalendar(selectedCalendarId);
    setSelectedCalendarId("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedCalendarId}
          onValueChange={(v) => v && setSelectedCalendarId(v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a calendar to add">
              {selectedCalendarLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableCalendars.length === 0 ? (
              <SelectItem value="none" disabled>
                No available calendars
              </SelectItem>
            ) : (
              availableCalendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedCalendarId || isAddPending}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          {isAddPending ? "Adding..." : "Add"}
        </Button>
      </div>

      {linkedCalendars.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No calendars linked yet. Add a calendar to make this appointment type
          available.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <Input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Filter linked calendars..."
              className="max-w-sm"
            />
          </div>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.id === "actions"
                          ? "w-[60px] text-right"
                          : undefined
                      }
                    >
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
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.original.calendarId}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={
                          cell.column.id === "actions"
                            ? "text-right"
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No linked calendars match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <DataTablePagination table={table} className="border-t-0" />
        </div>
      )}
    </div>
  );
}
