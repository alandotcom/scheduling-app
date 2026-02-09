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
import { RowActions } from "@/components/row-actions";
import {
  EntityCardField,
  EntityDesktopTable,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
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

interface ResourceListItem {
  id: string;
  name: string;
  quantity: number;
  locationId: string | null;
  createdAt: string | Date;
}

interface ResourcesListPresentationProps {
  resources: ResourceListItem[];
  getLocationName: (locationId: string | null | undefined) => string;
  onOpen: (resourceId: string) => void;
  onDelete: (resourceId: string) => void;
}

export function ResourcesListPresentation({
  resources,
  getLocationName,
  onOpen,
  onDelete,
}: ResourcesListPresentationProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const columns = useMemo<ColumnDef<ResourceListItem>[]>(
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
        id: "quantity",
        accessorKey: "quantity",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Quantity" />
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
    [getLocationName, onDelete, onOpen],
  );

  const table = useReactTable({
    data: resources,
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
        getLocationName(row.original.locationId).toLowerCase().includes(query)
      );
    },
  });

  return (
    <>
      <EntityMobileCardList>
        {table.getRowModel().rows.map((row) => {
          const resource = row.original;
          return (
            <EntityMobileCard
              key={resource.id}
              onOpen={() => onOpen(resource.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {resource.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getLocationName(resource.locationId)}
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${resource.name}`}
                  actions={[
                    {
                      label: "Edit",
                      onClick: () => onOpen(resource.id),
                    },
                    {
                      label: "Delete",
                      onClick: () => onDelete(resource.id),
                      variant: "destructive",
                    },
                  ]}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField label="Quantity" value={resource.quantity} />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(resource.createdAt)}
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
          placeholder="Filter resources..."
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
                  No resources match your filters.
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
