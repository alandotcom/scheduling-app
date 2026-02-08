// Calendars management page with modal-based CRUD

import { useCallback, useState } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { TableSkeleton } from "@/components/ui/skeleton";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { BlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import { AppointmentModal } from "@/components/appointment-modal";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import { DateOverridesEditor } from "@/components/availability/date-overrides-editor";
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
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
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import {
  formatDateISO,
  formatDisplayDate,
  formatDisplayDateTime,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { TIMEZONES } from "@/lib/constants";
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

type DetailTabValue = "details" | "availability" | "appointments";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "availability" || value === "appointments";

function CalendarsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const [availabilitySubTab, setAvailabilitySubTab] =
    useState<AvailabilitySubTabType>("weekly");
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type CalendarItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<CalendarItem>();
  const calendars = data?.items ?? [];
  const selectedCalendar =
    calendars.find((calendar) => calendar.id === selectedId) ?? null;
  const displayCalendar = useClosingSnapshot(selectedCalendar ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedCalendar,
    });

  const openDetails = useCallback(
    (calendarId: string, nextTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: calendarId,
          tab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    setAvailabilitySubTab("weekly");
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
      }),
    });
  }, [closeDetailModalNow, navigate]);

  const setActiveTab = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: (prev) => ({
          ...prev,
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  useValidateSelection(calendars, selectedId, clearDetails);

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
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeDelete();
        toast.success("Calendar deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete calendar");
      },
    }),
  );

  const locations = locationsData?.items ?? [];

  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        calendarId: selectedId ?? "",
        limit: 5,
        startDate: formatDateISO(DateTime.now()),
      },
    }),
    enabled: !!selectedId && activeTab === "appointments",
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
    if (!displayCalendar) return;
    updateMutation.mutate({
      id: displayCalendar.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const getContextMenuItems = useCallback(
    (calendar: CalendarItem): ContextMenuItem[] => [
      {
        label: "View",
        icon: ArrowRight02Icon,
        onClick: () => openDetails(calendar.id),
      },
      {
        label: "Manage Availability",
        icon: Clock01Icon,
        onClick: () => openDetails(calendar.id, "availability"),
      },
      {
        label: "View Appointments",
        icon: ArrowRight02Icon,
        onClick: () => openDetails(calendar.id, "appointments"),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => openDetails(calendar.id, "details"),
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(calendar.id),
        variant: "destructive",
      },
    ],
    [crud, openDetails],
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
          <div className="py-10" role="status" aria-live="polite">
            <TableSkeleton rows={5} cols={6} />
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendars.map((calendar) => (
                  <ContextMenu
                    key={calendar.id}
                    items={getContextMenuItems(calendar)}
                  >
                    <TableRow
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      tabIndex={0}
                      onClick={() => openDetails(calendar.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetails(calendar.id);
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
                      <TableCell>
                        <RowActions
                          ariaLabel={`Actions for ${calendar.name}`}
                          actions={getContextMenuItems(calendar)}
                        />
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
        open={detailModalOpen && !!displayCalendar}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        title={displayCalendar?.name ?? ""}
        description={
          displayCalendar
            ? `${formatTimezoneShort(displayCalendar.timezone)} · ${getLocationName(displayCalendar.locationId)}`
            : undefined
        }
        className="max-w-6xl"
      >
        {displayCalendar ? (
          <div className="space-y-4">
            <DetailTabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="px-0"
            >
              <DetailTab value="details">Details</DetailTab>
              <DetailTab value="availability">Availability</DetailTab>
              <DetailTab value="appointments">Appointments</DetailTab>
            </DetailTabs>

            <div className="space-y-6">
              {activeTab === "details" && (
                <div className="space-y-4">
                  <CalendarForm
                    key={displayCalendar.id}
                    defaultValues={{
                      name: displayCalendar.name,
                      timezone: displayCalendar.timezone,
                      locationId: displayCalendar.locationId ?? undefined,
                    }}
                    locations={locations}
                    onSubmit={handleUpdate}
                    onCancel={clearDetails}
                    isSubmitting={updateMutation.isPending}
                  />
                  <div className="border-t border-border pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => crud.openDelete(displayCalendar.id)}
                    >
                      <Icon icon={Delete01Icon} data-icon="inline-start" />
                      Delete Calendar
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "availability" && (
                <div className="space-y-6">
                  <AvailabilitySubTabs
                    value={availabilitySubTab}
                    onChange={setAvailabilitySubTab}
                  />

                  {availabilitySubTab === "weekly" && (
                    <WeeklyScheduleEditor
                      calendarId={displayCalendar.id}
                      timezone={displayCalendar.timezone}
                    />
                  )}
                  {availabilitySubTab === "overrides" && (
                    <DateOverridesEditor
                      calendarId={displayCalendar.id}
                      timezone={displayCalendar.timezone}
                    />
                  )}
                  {availabilitySubTab === "blocked" && (
                    <BlockedTimeEditor
                      calendarId={displayCalendar.id}
                      timezone={displayCalendar.timezone}
                    />
                  )}
                </div>
              )}

              {activeTab === "appointments" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Upcoming Appointments
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setAppointmentModalOpen(true)}
                      >
                        <Icon icon={Add01Icon} data-icon="inline-start" />
                        New Appointment
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/appointments"
                          search={{ calendarId: displayCalendar.id }}
                        >
                          View all
                          <Icon
                            icon={ArrowRight02Icon}
                            data-icon="inline-end"
                          />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {appointments.length === 0 ? (
                    <div className="rounded-lg border border-border p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No upcoming appointments
                      </p>
                      <Button
                        className="mt-4"
                        size="sm"
                        onClick={() => setAppointmentModalOpen(true)}
                      >
                        <Icon icon={Add01Icon} data-icon="inline-start" />
                        Create Appointment
                      </Button>
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
                                  displayCalendar.timezone,
                                )}{" "}
                                (
                                {formatTimezoneShort(
                                  displayCalendar.timezone,
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

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
        defaultCalendarId={displayCalendar?.id}
        defaultCalendarName={displayCalendar?.name}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/calendars/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
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
