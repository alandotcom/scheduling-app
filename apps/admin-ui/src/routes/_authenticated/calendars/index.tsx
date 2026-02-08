// Calendars management page with modal-based CRUD

import { useCallback, useState } from "react";
import { DateTime } from "luxon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  ArrowRight02Icon,
  Clock01Icon,
  Delete01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createCalendarSchema } from "@scheduling/dto";
import type { CreateCalendarInput } from "@scheduling/dto";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { BlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import { DateOverridesEditor } from "@/components/availability/date-overrides-editor";
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useCrudState } from "@/hooks/use-crud-state";
import {
  formatDateISO,
  formatDisplayDate,
  formatDisplayDateTime,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { TIMEZONES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getQueryClient, orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

interface CalendarFormProps {
  defaultValues?: {
    name: string;
    timezone: string;
    locationId?: string;
  };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateCalendarInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CalendarForm({
  defaultValues,
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
}: CalendarFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCalendarInput>({
    resolver: zodResolver(createCalendarSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      timezone: "America/New_York",
    },
  });

  const timezone = watch("timezone");
  const locationId = watch("locationId");

  const timezoneSelectLabel = resolveSelectValueLabel({
    value: timezone,
    options: TIMEZONES,
    getOptionValue: (tz) => tz,
    getOptionLabel: (tz) => tz,
    unknownLabel: "Unknown timezone",
  });

  const locationSelectLabel = resolveSelectValueLabel({
    value: locationId ?? "none",
    options: locations,
    getOptionValue: (location) => location.id,
    getOptionLabel: (location) => location.name,
    noneLabel: "No location",
    unknownLabel: "Unknown location",
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Dr. Smith's Calendar"
          aria-describedby={errors.name ? "name-error" : undefined}
          aria-invalid={!!errors.name}
          {...register("name")}
          disabled={isSubmitting}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={(value) => value && setValue("timezone", value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select timezone">
              {timezoneSelectLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        )}
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="locationId">Location (optional)</Label>
        <Select
          value={locationId ?? "none"}
          onValueChange={(value) =>
            value &&
            setValue("locationId", value === "none" ? undefined : value)
          }
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select location">
              {locationSelectLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No location</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

type ManageTab = "availability" | "appointments";

function CalendarsPage() {
  const queryClient = useQueryClient();
  const [manageCalendarId, setManageCalendarId] = useState<string | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>("availability");
  const [availabilitySubTab, setAvailabilitySubTab] =
    useState<AvailabilitySubTabType>("weekly");

  const { data, isLoading, error } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type CalendarItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<CalendarItem>();

  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  const createMutation = useMutation(
    orpc.calendars.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeCreate();
        toast.success("Calendar created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create calendar");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.calendars.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeEdit();
        toast.success("Calendar updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update calendar");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.calendars.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        const removedId = crud.deletingItemId;
        crud.closeDelete();
        if (removedId && removedId === manageCalendarId) {
          setManageCalendarId(null);
        }
        toast.success("Calendar deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete calendar");
      },
    }),
  );

  const locations = locationsData?.items ?? [];
  const calendars = data?.items ?? [];
  const manageCalendar =
    calendars.find((calendar) => calendar.id === manageCalendarId) ?? null;

  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        calendarId: manageCalendarId ?? "",
        limit: 5,
        startDate: formatDateISO(DateTime.now()),
      },
    }),
    enabled: !!manageCalendarId && manageTab === "appointments",
  });

  const appointments = appointmentsData?.items ?? [];

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((l) => l.id === locationId);
    return location?.name ?? "-";
  };

  const handleCreate = (formData: CreateCalendarInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateCalendarInput) => {
    if (!crud.editingItem) return;
    updateMutation.mutate({
      id: crud.editingItem.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const openManageModal = (calendar: CalendarItem, tab: ManageTab) => {
    setManageCalendarId(calendar.id);
    setManageTab(tab);
  };

  const closeManageModal = () => {
    setManageCalendarId(null);
    setManageTab("availability");
    setAvailabilitySubTab("weekly");
  };

  const getContextMenuItems = useCallback(
    (calendar: CalendarItem): ContextMenuItem[] => [
      {
        label: "Manage Availability",
        icon: Clock01Icon,
        onClick: () => openManageModal(calendar, "availability"),
      },
      {
        label: "View Appointments",
        icon: ArrowRight02Icon,
        onClick: () => openManageModal(calendar, "appointments"),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => crud.openEdit(calendar),
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(calendar.id),
        variant: "destructive",
      },
    ],
    [crud],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Calendars
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage calendars and their availability
          </p>
        </div>
        <Button className="shrink-0" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">Add Calendar</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div
            className="text-center text-muted-foreground py-10"
            role="status"
            aria-live="polite"
          >
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-destructive py-10">
            Error loading calendars
          </div>
        ) : !calendars.length ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
            No calendars yet. Create your first calendar to get started.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>This Week</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendars.map((calendar) => (
                  <ContextMenu
                    key={calendar.id}
                    items={getContextMenuItems(calendar)}
                  >
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                      )}
                      tabIndex={0}
                      onClick={() => crud.openEdit(calendar)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          crud.openEdit(calendar);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {calendar.name}
                      </TableCell>
                      <TableCell title={calendar.timezone}>
                        {formatTimezoneShort(calendar.timezone)}
                      </TableCell>
                      <TableCell>
                        {getLocationName(calendar.locationId)}
                      </TableCell>
                      <TableCell>
                        <RelationshipCountBadge
                          count={
                            calendar.relationshipCounts?.appointmentsThisWeek ??
                            0
                          }
                          singular="appointment"
                        />
                      </TableCell>
                      <TableCell>
                        {formatDisplayDate(calendar.createdAt)}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Calendar"
      >
        <CalendarForm
          locations={locations}
          onSubmit={handleCreate}
          onCancel={crud.closeCreate}
          isSubmitting={createMutation.isPending}
        />
      </EntityModal>

      <EntityModal
        open={!!crud.editingItem}
        onOpenChange={(open) => {
          if (!open) crud.closeEdit();
        }}
        title="Edit Calendar"
      >
        {crud.editingItem ? (
          <CalendarForm
            defaultValues={{
              name: crud.editingItem.name,
              timezone: crud.editingItem.timezone,
              locationId: crud.editingItem.locationId ?? undefined,
            }}
            locations={locations}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        ) : null}
      </EntityModal>

      <EntityModal
        open={!!manageCalendar}
        onOpenChange={(open) => {
          if (!open) closeManageModal();
        }}
        title={manageCalendar ? manageCalendar.name : "Manage Calendar"}
        description={
          manageCalendar
            ? `${formatTimezoneShort(manageCalendar.timezone)} · ${getLocationName(manageCalendar.locationId)}`
            : undefined
        }
        className="max-w-4xl"
      >
        {manageCalendar ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <Button
                type="button"
                size="sm"
                variant={manageTab === "availability" ? "default" : "outline"}
                onClick={() => setManageTab("availability")}
              >
                Availability
              </Button>
              <Button
                type="button"
                size="sm"
                variant={manageTab === "appointments" ? "default" : "outline"}
                onClick={() => setManageTab("appointments")}
              >
                Appointments
              </Button>
            </div>

            {manageTab === "availability" ? (
              <div className="space-y-6">
                <AvailabilitySubTabs
                  value={availabilitySubTab}
                  onChange={setAvailabilitySubTab}
                />

                {availabilitySubTab === "weekly" && (
                  <WeeklyScheduleEditor
                    calendarId={manageCalendar.id}
                    timezone={manageCalendar.timezone}
                  />
                )}
                {availabilitySubTab === "overrides" && (
                  <DateOverridesEditor
                    calendarId={manageCalendar.id}
                    timezone={manageCalendar.timezone}
                  />
                )}
                {availabilitySubTab === "blocked" && (
                  <BlockedTimeEditor
                    calendarId={manageCalendar.id}
                    timezone={manageCalendar.timezone}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Upcoming Appointments
                  </h3>
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to="/appointments"
                      search={{ calendarId: manageCalendar.id }}
                    >
                      View all
                      <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>

                {appointments.length === 0 ? (
                  <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                    No upcoming appointments
                  </div>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border/50">
                    {appointments.map((apt) => (
                      <div key={apt.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">
                              {formatDisplayDateTime(
                                apt.startAt,
                                manageCalendar.timezone,
                              )}{" "}
                              (
                              {formatTimezoneShort(
                                manageCalendar.timezone,
                                apt.startAt,
                              )}
                              )
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {apt.appointmentType?.name}
                              {apt.client &&
                                ` - ${apt.client.firstName} ${apt.client.lastName}`}
                            </div>
                          </div>
                          <Badge
                            variant={
                              apt.status === "confirmed"
                                ? "success"
                                : "secondary"
                            }
                          >
                            {apt.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </EntityModal>

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Calendar"
        description="Are you sure you want to delete this calendar? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/calendars/")({
  loader: async () => {
    const queryClient = getQueryClient();
    await Promise.all([
      queryClient.ensureQueryData(
        orpc.calendars.list.queryOptions({ input: { limit: 100 } }),
      ),
      queryClient.ensureQueryData(
        orpc.locations.list.queryOptions({ input: { limit: 100 } }),
      ),
    ]);
  },
  component: CalendarsPage,
});
