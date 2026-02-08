import { useMemo, useState } from "react";
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

import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
import {
  EntityCardField,
  EntityDesktopTable,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDate, formatTimezoneShort } from "@/lib/date-utils";

interface CalendarListItem {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  locationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relationshipCounts: {
    appointmentsThisWeek: number;
  };
}

interface CalendarsListPresentationProps {
  calendars: CalendarListItem[];
  getLocationName: (locationId: string | null | undefined) => string;
  getActions: (calendar: CalendarListItem) => ContextMenuItem[];
  onOpen: (calendarId: string) => void;
}

export function CalendarsListPresentation({
  calendars,
  getLocationName,
  getActions,
  onOpen,
}: CalendarsListPresentationProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const columns = useMemo<ColumnDef<CalendarListItem>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: "timezone",
        accessorKey: "timezone",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Timezone" />
        ),
        cell: ({ row }) => (
          <span title={row.original.timezone}>
            {formatTimezoneShort(row.original.timezone)}
          </span>
        ),
      },
      {
        id: "location",
        accessorFn: (row) => getLocationName(row.locationId),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Location" />
        ),
      },
      {
        id: "appointmentsThisWeek",
        accessorFn: (row) => row.relationshipCounts?.appointmentsThisWeek ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="This Week" />
        ),
        cell: ({ row }) => (
          <RelationshipCountBadge
            count={row.original.relationshipCounts?.appointmentsThisWeek ?? 0}
            singular="appointment"
          />
        ),
      },
      {
        id: "createdAt",
        accessorFn: (row) => {
          const value = row.createdAt;
          return typeof value === "string"
            ? new Date(value).getTime()
            : value.getTime();
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => formatDisplayDate(row.original.createdAt),
      },
      {
        id: "actions",
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            ariaLabel={`Actions for ${row.original.name}`}
            actions={getActions(row.original)}
          />
        ),
      },
    ],
    [getActions, getLocationName],
  );

  const table = useReactTable({
    data: calendars,
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
        row.original.name.toLowerCase().includes(query) ||
        row.original.timezone.toLowerCase().includes(query) ||
        getLocationName(row.original.locationId).toLowerCase().includes(query)
      );
    },
  });

  return (
    <>
      <EntityMobileCardList>
        {table.getRowModel().rows.map((row) => {
          const calendar = row.original;
          return (
            <EntityMobileCard
              key={calendar.id}
              onOpen={() => onOpen(calendar.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {calendar.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span title={calendar.timezone}>
                      {formatTimezoneShort(calendar.timezone)}
                    </span>
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${calendar.name}`}
                  actions={getActions(calendar)}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Location"
                  value={getLocationName(calendar.locationId)}
                />
                <EntityCardField
                  label="This Week"
                  value={
                    <RelationshipCountBadge
                      count={
                        calendar.relationshipCounts?.appointmentsThisWeek ?? 0
                      }
                      singular="appointment"
                    />
                  }
                />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(calendar.createdAt)}
                />
              </dl>
            </EntityMobileCard>
          );
        })}
      </EntityMobileCardList>

      <DataTablePagination
        table={table}
        className="justify-center rounded-xl border border-border bg-card shadow-sm md:hidden"
      />

      <EntityDesktopTable>
        <div className="border-b border-border px-4 py-3">
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Filter calendars..."
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
                      header.id === "actions" ? "text-right" : undefined
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
                <ContextMenu
                  key={row.original.id}
                  items={getActions(row.original)}
                >
                  <TableRow
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    tabIndex={0}
                    onClick={() => onOpen(row.original.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(row.original.id);
                      }
                    }}
                  >
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
                </ContextMenu>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No calendars match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </EntityDesktopTable>
    </>
  );
}
