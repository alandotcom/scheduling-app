// Calendars tab for linking calendars to appointment types

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import {
  Add01Icon,
  Alert02Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { formatTimezoneShort } from "@/lib/date-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    locationId: string | null;
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
  const [pendingOrgWide, setPendingOrgWide] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Fetch linked calendars for this type
  const { data: linkedCalendarsData } = useQuery({
    ...orpc.appointmentTypes.calendarLinks.list.queryOptions({
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

  // Required resources + locations let us flag calendars that can't reserve a
  // location-bound resource the type depends on.
  const { data: requiredResourcesData } = useQuery({
    ...orpc.appointmentTypes.resourceLinks.list.queryOptions({
      input: { appointmentTypeId },
    }),
    enabled: !!appointmentTypeId,
  });

  const { data: locationsData } = useQuery({
    ...orpc.locations.list.queryOptions({ input: { limit: 100 } }),
    enabled: !!appointmentTypeId,
  });

  const queryClient = useQueryClient();
  const makeResourceOrgWideMutation = useMutation(
    orpc.resources.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.resourceLinks.key(),
        });
        // A resource leaving a location changes that location's resource count.
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        setPendingOrgWide(null);
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update resource");
      },
    }),
  );

  const linkedCalendars = useMemo(
    () => linkedCalendarsData ?? [],
    [linkedCalendarsData],
  );

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const location of locationsData?.items ?? []) {
      map.set(location.id, location.name);
    }
    return map;
  }, [locationsData?.items]);

  // The location-bound resources this type requires (org-wide ones never clash).
  const locationBoundResources = useMemo(
    () =>
      (requiredResourcesData ?? [])
        .map((link) => link.resource)
        .filter(
          (resource): resource is typeof resource & { locationId: string } =>
            resource.locationId !== null,
        ),
    [requiredResourcesData],
  );

  // Per calendar, the required location-bound resources that won't be reserved
  // there (resource lives at a different location, or the calendar has none).
  const unmetResourcesByCalendarId = useMemo(() => {
    const map = new Map<string, typeof locationBoundResources>();
    if (locationBoundResources.length === 0) return map;
    for (const link of linkedCalendars) {
      const unmet = locationBoundResources.filter(
        (resource) => resource.locationId !== link.calendar.locationId,
      );
      if (unmet.length > 0) map.set(link.calendarId, unmet);
    }
    return map;
  }, [linkedCalendars, locationBoundResources]);

  const calendarLocationLabel = useCallback(
    (locationId: string | null) =>
      locationId
        ? (locationNameById.get(locationId) ?? "Unknown location")
        : "No location",
    [locationNameById],
  );

  const offeredLocationSummary = useMemo(() => {
    const labels = [
      ...new Set(
        linkedCalendars.map((link) =>
          calendarLocationLabel(link.calendar.locationId),
        ),
      ),
    ];
    return labels.join(", ");
  }, [linkedCalendars, calendarLocationLabel]);

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
        id: "location",
        accessorFn: (row) => calendarLocationLabel(row.calendar.locationId),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Location" />
        ),
        cell: ({ row }) => {
          const hasMismatch = unmetResourcesByCalendarId.has(
            row.original.calendarId,
          );
          return (
            <span className="inline-flex items-center gap-1.5">
              {row.original.calendar.locationId ? (
                calendarLocationLabel(row.original.calendar.locationId)
              ) : (
                <span className="text-muted-foreground">No location</span>
              )}
              {hasMismatch ? (
                <Icon
                  icon={Alert02Icon}
                  className="size-3.5 text-amber-600 dark:text-amber-400"
                />
              ) : null}
            </span>
          );
        },
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
    [
      calendarLocationLabel,
      isRemovePending,
      onRemoveCalendar,
      unmetResourcesByCalendarId,
    ],
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
                  {calendar.name} · {calendarLocationLabel(calendar.locationId)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleAdd}
          loading={isAddPending}
          disabled={!selectedCalendarId || isAddPending}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add
        </Button>
      </div>

      {unmetResourcesByCalendarId.size > 0 ? (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
            <Icon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
            <p>
              Some calendars can't reserve a required resource. Bookings there
              will still succeed, but won't hold that resource.
            </p>
          </div>
          <ul className="space-y-2">
            {linkedCalendars
              .filter((link) => unmetResourcesByCalendarId.has(link.calendarId))
              .map((link) => {
                const unmet =
                  unmetResourcesByCalendarId.get(link.calendarId) ?? [];
                return (
                  <li
                    key={link.calendarId}
                    className="rounded-md border border-border bg-background p-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {link.calendar.name}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {calendarLocationLabel(link.calendar.locationId)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemoveCalendar(link.calendarId)}
                        disabled={isRemovePending}
                      >
                        Remove calendar
                      </Button>
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {unmet.map((resource) => (
                        <li
                          key={resource.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground"
                        >
                          <span>
                            Won't reserve{" "}
                            <span className="font-medium text-foreground">
                              {resource.name}
                            </span>{" "}
                            (at {calendarLocationLabel(resource.locationId)})
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPendingOrgWide({
                                id: resource.id,
                                name: resource.name,
                              })
                            }
                            disabled={makeResourceOrgWideMutation.isPending}
                          >
                            Make {resource.name} org-wide
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

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

      {linkedCalendars.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Offered at {offeredLocationSummary}.
          {unmetResourcesByCalendarId.size > 0
            ? ` ${unmetResourcesByCalendarId.size} calendar${
                unmetResourcesByCalendarId.size === 1 ? "" : "s"
              } can't reserve every required resource.`
            : ""}
        </p>
      ) : null}

      <AlertDialog
        open={pendingOrgWide !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOrgWide(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make {pendingOrgWide?.name} org-wide?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This changes the resource everywhere, not just for this
              appointment type. {pendingOrgWide?.name} will become bookable from
              every location and shared as a single pool across the whole
              organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingOrgWide) {
                  makeResourceOrgWideMutation.mutate({
                    id: pendingOrgWide.id,
                    locationId: null,
                  });
                }
              }}
              loading={makeResourceOrgWideMutation.isPending}
            >
              Make org-wide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
