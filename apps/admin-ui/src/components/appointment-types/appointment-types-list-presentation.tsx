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

import { Search01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import {
  EntityCardField,
  EntityDesktopTable,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
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
import { formatDisplayDate } from "@/lib/date-utils";

type ManageTab = "details" | "calendars" | "resources";

interface AppointmentTypeListItem {
  id: string;
  orgId: string;
  name: string;
  durationMin: number;
  paddingBeforeMin: number | null;
  paddingAfterMin: number | null;
  capacity: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  relationshipCounts: {
    calendars: number;
    resources: number;
    appointments: number;
  };
}

interface AppointmentTypesListPresentationProps {
  appointmentTypes: AppointmentTypeListItem[];
  getActions: (type: AppointmentTypeListItem) => ContextMenuItem[];
  onOpen: (typeId: string, tab?: ManageTab) => void;
}

export function AppointmentTypesListPresentation({
  appointmentTypes,
  getActions,
  onOpen,
}: AppointmentTypesListPresentationProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const columns = useMemo<ColumnDef<AppointmentTypeListItem>[]>(
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
        id: "durationMin",
        accessorKey: "durationMin",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Duration" />
        ),
        cell: ({ row }) => `${row.original.durationMin} min`,
      },
      {
        id: "padding",
        accessorFn: (row) =>
          `${row.paddingBeforeMin ?? 0}/${row.paddingAfterMin ?? 0}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Padding" />
        ),
        cell: ({ row }) =>
          row.original.paddingBeforeMin || row.original.paddingAfterMin ? (
            <span className="text-muted-foreground">
              {row.original.paddingBeforeMin ?? 0} /{" "}
              {row.original.paddingAfterMin ?? 0} min
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "capacity",
        accessorFn: (row) => row.capacity ?? 1,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Capacity" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.capacity ?? 1}</Badge>
        ),
      },
      {
        id: "relationships",
        accessorFn: (row) =>
          (row.relationshipCounts?.calendars ?? 0) +
          (row.relationshipCounts?.resources ?? 0) +
          (row.relationshipCounts?.appointments ?? 0),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Relationships" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <RelationshipCountBadge
              count={row.original.relationshipCounts?.calendars ?? 0}
              singular="calendar"
            />
            <RelationshipCountBadge
              count={row.original.relationshipCounts?.resources ?? 0}
              singular="resource"
            />
            <RelationshipCountBadge
              count={row.original.relationshipCounts?.appointments ?? 0}
              singular="appointment"
            />
          </div>
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
    [getActions],
  );

  const table = useReactTable({
    data: appointmentTypes,
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
      return row.original.name.toLowerCase().includes(query);
    },
  });

  return (
    <>
      <EntityMobileCardList>
        {table.getRowModel().rows.map((row) => {
          const type = row.original;
          return (
            <EntityMobileCard
              key={type.id}
              onOpen={() => onOpen(type.id, "details")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {type.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {type.durationMin} min
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${type.name}`}
                  actions={getActions(type)}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Capacity"
                  value={
                    <Badge variant="secondary">{type.capacity ?? 1}</Badge>
                  }
                />
                <EntityCardField
                  label="Padding"
                  value={`${type.paddingBeforeMin ?? 0} / ${type.paddingAfterMin ?? 0} min`}
                />
                <EntityCardField
                  label="Calendars"
                  value={
                    <RelationshipCountBadge
                      count={type.relationshipCounts?.calendars ?? 0}
                      singular="calendar"
                    />
                  }
                />
                <EntityCardField
                  label="Resources"
                  value={
                    <RelationshipCountBadge
                      count={type.relationshipCounts?.resources ?? 0}
                      singular="resource"
                    />
                  }
                />
                <EntityCardField
                  label="Appointments"
                  value={
                    <RelationshipCountBadge
                      count={type.relationshipCounts?.appointments ?? 0}
                      singular="appointment"
                    />
                  }
                />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(type.createdAt)}
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

      <div className="relative mb-4 max-w-sm hidden md:block">
        <Icon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Filter appointment types..."
          className="pl-10"
        />
      </div>

      <EntityDesktopTable>
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
                    onClick={() => onOpen(row.original.id, "details")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(row.original.id, "details");
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
                  No appointment types match your filters.
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
