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

interface LocationListItem {
  id: string;
  name: string;
  timezone: string;
  createdAt: string | Date;
  relationshipCounts?: {
    calendars?: number;
    resources?: number;
  } | null;
}

interface LocationsListPresentationProps {
  locations: LocationListItem[];
  onOpen: (locationId: string) => void;
  onDelete: (locationId: string) => void;
}

export function LocationsListPresentation({
  locations,
  onOpen,
  onDelete,
}: LocationsListPresentationProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const columns = useMemo<ColumnDef<LocationListItem>[]>(
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
        id: "relationships",
        accessorFn: (row) =>
          (row.relationshipCounts?.calendars ?? 0) +
          (row.relationshipCounts?.resources ?? 0),
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
            actions={[
              {
                label: "Edit",
                onClick: () => onOpen(row.original.id),
              },
              {
                label: "Delete",
                onClick: () => onDelete(row.original.id),
                variant: "destructive",
              },
            ]}
          />
        ),
      },
    ],
    [onDelete, onOpen],
  );

  const table = useReactTable({
    data: locations,
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
        row.original.timezone.toLowerCase().includes(query)
      );
    },
  });

  return (
    <>
      <EntityMobileCardList>
        {table.getRowModel().rows.map((row) => {
          const location = row.original;
          return (
            <EntityMobileCard
              key={location.id}
              onOpen={() => onOpen(location.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {location.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span title={location.timezone}>
                      {formatTimezoneShort(location.timezone)}
                    </span>
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${location.name}`}
                  actions={[
                    {
                      label: "Edit",
                      onClick: () => onOpen(location.id),
                    },
                    {
                      label: "Delete",
                      onClick: () => onDelete(location.id),
                      variant: "destructive",
                    },
                  ]}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Calendars"
                  value={
                    <RelationshipCountBadge
                      count={location.relationshipCounts?.calendars ?? 0}
                      singular="calendar"
                    />
                  }
                />
                <EntityCardField
                  label="Resources"
                  value={
                    <RelationshipCountBadge
                      count={location.relationshipCounts?.resources ?? 0}
                      singular="resource"
                    />
                  }
                />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(location.createdAt)}
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
            placeholder="Filter locations..."
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
                <TableRow
                  key={row.original.id}
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
                        cell.column.id === "actions" ? "text-right" : undefined
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
                  No locations match your filters.
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
