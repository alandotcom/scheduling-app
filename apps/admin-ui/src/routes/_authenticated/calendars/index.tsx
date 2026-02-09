// Calendars management page with modal-based CRUD

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { BlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import { AppointmentModal } from "@/components/appointment-modal";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import { DateOverridesEditor } from "@/components/availability/date-overrides-editor";
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import type { ContextMenuItem } from "@/components/context-menu";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import { PageHeader, PageScaffold } from "@/components/layout/page-scaffold";
import { CalendarsListPresentation } from "@/components/calendars/calendars-list-presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrudState } from "@/hooks/use-crud-state";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import {
  formatDateISO,
  formatDisplayDateTime,
  formatTimezonePickerLabel,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { TIMEZONES } from "@/lib/constants";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
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
  const formRef = useRef<HTMLFormElement>(null);
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
    getOptionLabel: (tz) => formatTimezonePickerLabel(tz),
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

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    fields: [
      { id: "name", key: "n", description: "Focus name" },
      {
        id: "timezone",
        key: "t",
        description: "Focus timezone",
        openOnFocus: true,
      },
      {
        id: "location",
        key: "l",
        description: "Focus location",
        openOnFocus: true,
      },
    ],
  });

  useSubmitShortcut({
    enabled: !isSubmitting,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5 relative" ref={registerField("name")}>
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
        <FieldShortcutHint shortcut="n" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("timezone")}>
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
                {formatTimezonePickerLabel(tz)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        )}
        <FieldShortcutHint shortcut="t" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("location")}>
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
        <FieldShortcutHint shortcut="l" visible={hintsVisible} />
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
          <ShortcutBadge
            shortcut="meta+enter"
            className="ml-2 hidden sm:inline-flex"
          />
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
  const { selected, tab, create } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const [availabilitySubTab, setAvailabilitySubTab] =
    useState<AvailabilitySubTabType>("weekly");
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type CalendarItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<CalendarItem>();

  useEffect(() => {
    if (create !== "1") return;
    crud.openCreate();
    navigate({
      search: (prev) => ({
        ...prev,
        create: undefined,
      }),
      replace: true,
    });
  }, [create, crud, navigate]);

  const calendars = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
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
      replace: true,
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

  useValidateSelection({
    items: calendars,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? calendars.findIndex((calendar) => calendar.id === selectedId)
    : -1;

  useListNavigation({
    items: calendars,
    selectedIndex,
    onSelect: (index) => {
      const calendar = calendars[index];
      if (calendar) openDetails(calendar.id);
    },
    onOpen: (calendar) => openDetails(calendar.id),
    enabled:
      calendars.length > 0 &&
      !crud.showCreateForm &&
      !detailModalOpen &&
      !appointmentModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create calendar",
      },
      {
        key: "escape",
        action: clearDetails,
        description: "Close details",
        ignoreInputs: false,
      },
    ],
    enabled: !crud.showCreateForm && !detailModalOpen && !appointmentModalOpen,
  });

  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  const createMutation = useMutation(
    orpc.calendars.create.mutationOptions({
      onSuccess: (createdCalendar) => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeCreate();
        openDetails(createdCalendar.id, "details");
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
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
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
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeDelete();
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

  const handleAppointmentCreated = useCallback(
    (appointmentId: string) => {
      navigate({
        to: "/appointments",
        search: {
          selected: appointmentId,
          tab: "details",
        },
      });
    },
    [navigate],
  );

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
    <PageScaffold className="pb-24 sm:pb-6">
      <PageHeader
        title="Calendars"
        description="Manage calendars and their availability"
        actions={
          <Button className="hidden sm:inline-flex" onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add Calendar
            <ShortcutBadge
              shortcut="c"
              className="ml-2 hidden md:inline-flex"
            />
          </Button>
        }
      />

      <div className="mt-6">
        {isLoading ? (
          <EntityListLoadingState rows={5} cols={6} />
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading calendars
          </div>
        ) : !calendars.length ? (
          <EntityListEmptyState>
            No calendars yet. Create your first calendar to get started.
          </EntityListEmptyState>
        ) : (
          <CalendarsListPresentation
            calendars={calendars}
            getLocationName={getLocationName}
            getActions={getContextMenuItems}
            onOpen={openDetails}
          />
        )}
      </div>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Calendar"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CalendarForm
            locations={locations}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={detailModalOpen && !!displayCalendar}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        headerActions={
          displayCalendar ? (
            <CopyIdHeaderAction
              id={displayCalendar.id}
              entityLabel="calendar"
            />
          ) : null
        }
        title={displayCalendar?.name ?? ""}
        description={
          displayCalendar
            ? `${formatTimezoneShort(displayCalendar.timezone)} · ${getLocationName(displayCalendar.locationId)}`
            : undefined
        }
      >
        {displayCalendar ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
        onCreated={handleAppointmentCreated}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Calendar
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/calendars/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { create?: "1"; selected?: string; tab?: DetailTabValue } => {
    const create = search.create === "1" ? "1" : undefined;
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { create, selected, tab };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(
          orpc.calendars.list.queryOptions({ input: { limit: 100 } }),
        ),
        queryClient.ensureQueryData(
          orpc.locations.list.queryOptions({ input: { limit: 100 } }),
        ),
      ]),
    );
  },
  component: CalendarsPage,
});
