// Resources tab for linking resources to appointment types

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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

interface ResourcesTabProps {
  appointmentTypeId: string;
  onAddResource: (resourceId: string, quantityRequired: number) => void;
  onUpdateQuantity: (resourceId: string, quantityRequired: number) => void;
  onRemoveResource: (resourceId: string) => void;
  isAddPending: boolean;
  isUpdatePending: boolean;
  isRemovePending: boolean;
}

interface RequiredResourceRow {
  resourceId: string;
  quantityRequired: number;
  resource: {
    id: string;
    name: string;
    quantity: number;
  };
}

export function ResourcesTab({
  appointmentTypeId,
  onAddResource,
  onUpdateQuantity,
  onRemoveResource,
  isAddPending,
  isUpdatePending,
  isRemovePending,
}: ResourcesTabProps) {
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [quantityRequired, setQuantityRequired] = useState<number>(1);
  const [quantityDraftsByResourceId, setQuantityDraftsByResourceId] = useState<
    Record<string, string>
  >({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch required resources for this type
  const { data: requiredResourcesData } = useQuery({
    ...orpc.appointmentTypes.resources.list.queryOptions({
      input: { appointmentTypeId },
    }),
    enabled: !!appointmentTypeId,
  });

  // Fetch all resources for dropdown
  const { data: allResourcesData } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!appointmentTypeId,
  });

  const requiredResources = requiredResourcesData ?? [];

  useEffect(() => {
    const syncedDrafts = Object.fromEntries(
      requiredResources.map((resource) => [
        resource.resourceId,
        String(resource.quantityRequired),
      ]),
    );

    setQuantityDraftsByResourceId((previousDrafts) => {
      const previousEntries = Object.entries(previousDrafts);
      const nextEntries = Object.entries(syncedDrafts);
      if (previousEntries.length !== nextEntries.length) return syncedDrafts;
      for (const [resourceId, quantity] of nextEntries) {
        if (previousDrafts[resourceId] !== quantity) return syncedDrafts;
      }
      return previousDrafts;
    });
  }, [requiredResources]);

  // Memoize derived state
  const availableResources = useMemo(() => {
    const linkedResourceIds = new Set(
      requiredResources.map((r) => r.resourceId),
    );
    return (
      allResourcesData?.items.filter(
        (resource) => !linkedResourceIds.has(resource.id),
      ) ?? []
    );
  }, [requiredResources, allResourcesData?.items]);
  const selectedResourceLabel = resolveSelectValueLabel({
    value: selectedResourceId,
    options: availableResources,
    getOptionValue: (resource) => resource.id,
    getOptionLabel: (resource) =>
      `${resource.name} (Qty: ${resource.quantity})`,
    unknownLabel: "Unknown resource",
  });

  // Debounced quantity update
  const handleQuantityChange = useCallback(
    (resourceId: string, newQty: number, maxQty: number) => {
      if (!Number.isFinite(newQty)) return;
      if (newQty < 1 || newQty > maxQty) return;

      // Clear existing timer
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new timer for 500ms
      debounceRef.current = setTimeout(() => {
        onUpdateQuantity(resourceId, newQty);
      }, 500);
    },
    [onUpdateQuantity],
  );

  const handleRequiredQuantityInputChange = useCallback(
    (resourceId: string, rawValue: string, maxQty: number) => {
      setQuantityDraftsByResourceId((previousDrafts) => {
        if (previousDrafts[resourceId] === rawValue) return previousDrafts;
        return {
          ...previousDrafts,
          [resourceId]: rawValue,
        };
      });

      const parsedQuantity = Number.parseInt(rawValue, 10);
      handleQuantityChange(resourceId, parsedQuantity, maxQty);
    },
    [handleQuantityChange],
  );

  const columns = useMemo<ColumnDef<RequiredResourceRow>[]>(
    () => [
      {
        id: "resource",
        accessorFn: (row) => row.resource.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Resource" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.resource.name}</span>
        ),
      },
      {
        id: "available",
        accessorFn: (row) => row.resource.quantity,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Available" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.resource.quantity}
          </span>
        ),
      },
      {
        id: "required",
        accessorFn: (row) => row.quantityRequired,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Required" />
        ),
        cell: ({ row }) => (
          <Input
            type="number"
            min={1}
            max={row.original.resource.quantity}
            className="h-8 w-[70px]"
            value={
              quantityDraftsByResourceId[row.original.resourceId] ??
              String(row.original.quantityRequired)
            }
            onChange={(event) => {
              handleRequiredQuantityInputChange(
                row.original.resourceId,
                event.target.value,
                row.original.resource.quantity,
              );
            }}
            disabled={isUpdatePending}
          />
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
            onClick={() => onRemoveResource(row.original.resourceId)}
            disabled={isRemovePending}
          >
            <Icon icon={Delete01Icon} />
          </Button>
        ),
      },
    ],
    [
      handleRequiredQuantityInputChange,
      isRemovePending,
      isUpdatePending,
      onRemoveResource,
      quantityDraftsByResourceId,
    ],
  );

  const table = useReactTable({
    data: requiredResources,
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
      return row.original.resource.name.toLowerCase().includes(query);
    },
  });

  const handleAdd = () => {
    if (!selectedResourceId) return;
    onAddResource(selectedResourceId, quantityRequired);
    setSelectedResourceId("");
    setQuantityRequired(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedResourceId}
          onValueChange={(v) => v && setSelectedResourceId(v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a resource to add">
              {selectedResourceLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableResources.length === 0 ? (
              <SelectItem value="none" disabled>
                No available resources
              </SelectItem>
            ) : (
              availableResources.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.name} (Qty: {resource.quantity})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          className="w-[80px]"
          value={quantityRequired}
          onChange={(e) =>
            setQuantityRequired(parseInt(e.target.value, 10) || 1)
          }
          placeholder="Qty"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedResourceId || isAddPending}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          {isAddPending ? "Adding..." : "Add"}
        </Button>
      </div>

      {requiredResources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No resources required. Add resources if this appointment type requires
          specific equipment or rooms.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <Input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Filter linked resources..."
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
                  <TableRow key={row.original.resourceId}>
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
                    No linked resources match your filters.
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
