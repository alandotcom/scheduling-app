import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDate } from "@/lib/date-utils";
import { formatPhoneForDisplay } from "@/lib/phone";

interface ClientListItem {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  referenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relationshipCounts: {
    appointments: number;
  };
}

interface ClientsListPresentationProps {
  clients: ClientListItem[];
  onOpen: (clientId: string) => void;
  onHoverIntent?: (clientId: string) => void;
  getActions: (client: ClientListItem) => ContextMenuItem[];
}

export function ClientsListPresentation({
  clients,
  onOpen,
  onHoverIntent,
  getActions,
}: ClientsListPresentationProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverIntentTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  useEffect(() => clearHoverIntentTimer, [clearHoverIntentTimer]);

  const scheduleHoverIntent = useCallback(
    (clientId: string) => {
      if (!onHoverIntent) return;
      clearHoverIntentTimer();
      hoverTimerRef.current = setTimeout(() => {
        onHoverIntent(clientId);
        hoverTimerRef.current = null;
      }, 250);
    },
    [clearHoverIntentTimer, onHoverIntent],
  );

  const columns = useMemo<ColumnDef<ClientListItem>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      },
      {
        id: "email",
        accessorFn: (row) => row.email ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) =>
          row.original.email || (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "phone",
        accessorFn: (row) => formatPhoneForDisplay(row.phone) ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Phone" />
        ),
        cell: ({ row }) =>
          formatPhoneForDisplay(row.original.phone) ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "appointments",
        accessorFn: (row) => row.relationshipCounts?.appointments ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Appointments" />
        ),
        cell: ({ row }) => (
          <RelationshipCountBadge
            count={row.original.relationshipCounts?.appointments ?? 0}
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
        cell: ({ row }) => {
          const displayName = `${row.original.firstName} ${row.original.lastName}`;
          return (
            <RowActions
              ariaLabel={`Actions for ${displayName}`}
              actions={getActions(row.original)}
            />
          );
        },
      },
    ],
    [getActions],
  );

  const table = useReactTable({
    data: clients,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <EntityMobileCardList>
        {table.getRowModel().rows.map((row) => {
          const client = row.original;
          const formattedPhone = formatPhoneForDisplay(client.phone);
          const displayName = `${client.firstName} ${client.lastName}`;

          return (
            <EntityMobileCard key={client.id} onOpen={() => onOpen(client.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {displayName}
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {client.email ?? formattedPhone ?? "No contact details"}
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${displayName}`}
                  actions={getActions(client)}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Appointments"
                  value={
                    <RelationshipCountBadge
                      count={client.relationshipCounts?.appointments ?? 0}
                      singular="appointment"
                    />
                  }
                />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(client.createdAt)}
                />
                <EntityCardField
                  label="Email"
                  value={
                    client.email ? (
                      <span className="break-all">{client.email}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )
                  }
                  className="col-span-2"
                />
                <EntityCardField
                  label="Phone"
                  value={
                    formattedPhone ?? (
                      <span className="text-muted-foreground">-</span>
                    )
                  }
                  className="col-span-2"
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
                    onMouseEnter={() => scheduleHoverIntent(row.original.id)}
                    onMouseLeave={clearHoverIntentTimer}
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
                  No clients match your filters.
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
