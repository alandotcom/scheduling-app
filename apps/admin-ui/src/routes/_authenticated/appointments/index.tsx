// Appointments page with list/schedule views and modal detail panel

import { useState, useCallback, useMemo, useEffect } from "react";
import { DateTime } from "luxon";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";

import { Icon } from "@/components/ui/icon";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import {
  formatDisplayDate,
  formatTimezoneShort,
  getUserTimezone,
  parseDateParamInTimezone,
} from "@/lib/date-utils";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  isSchedulingTimezoneMode,
  resolveEffectiveSchedulingTimezone,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import { Button } from "@/components/ui/button";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  FilterPopover,
  FilterField,
  ActiveFilters,
} from "@/components/filter-popover";
import { AppointmentModal } from "@/components/appointment-modal";
import { EntityModal } from "@/components/entity-modal";
import {
  useKeyboardShortcuts,
  useFocusZones,
  useListNavigation,
  FOCUS_ZONES,
} from "@/hooks/use-keyboard-shortcuts";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import {
  useScheduleAppointments,
  getWeekStart,
  formatDateParam,
} from "@/hooks/use-schedule-appointments";
import { ViewToggle } from "@/components/appointments/view-toggle";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { AppointmentsTimezoneControl } from "@/components/appointments/appointments-timezone-control";
import { AppointmentsList } from "@/components/appointments/appointments-list";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { ScheduleGrid } from "@/components/appointments/schedule-grid";

type ViewMode = "list" | "schedule";
type DetailTabValue = "details" | "client" | "history";
type ListScope = "upcoming" | "history";
const STATUS_FILTER_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "client" || value === "history";
const isListScope = (value: string): value is ListScope =>
  value === "upcoming" || value === "history";

function AppointmentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    selected,
    tab,
    view = "list",
    date,
    calendarId: urlCalendarId,
    clientId: urlClientId,
    appointmentTypeId: urlAppointmentTypeId,
    status: urlStatus,
    listScope: urlListScope,
    tzMode,
    tz,
    create,
  } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedId,
    });
  const currentView: ViewMode = view;
  const listScope: ListScope =
    urlListScope && isListScope(urlListScope) ? urlListScope : "upcoming";

  // Confirmation dialogs
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [noShowId, setNoShowId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (create !== "1") return;
    setModalOpen(true);
    navigate({
      search: (prev) => ({
        ...prev,
        create: undefined,
      }),
      replace: true,
    });
  }, [create, navigate]);

  // Filters from URL
  const filters = useMemo(
    () => ({
      calendarId: urlCalendarId ?? "",
      clientId: urlClientId ?? "",
      appointmentTypeId: urlAppointmentTypeId ?? "",
      status: urlStatus ?? "",
    }),
    [urlCalendarId, urlClientId, urlAppointmentTypeId, urlStatus],
  );

  // Navigation callbacks
  const openDetails = useCallback(
    (appointmentId: string, detailTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: appointmentId,
          tab: detailTab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
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

  const setView = useCallback(
    (newView: ViewMode) => {
      navigate({
        search: (prev) => ({
          ...prev,
          view: newView,
          // Set date to current week start when switching to schedule
          date:
            newView === "schedule" && !prev.date
              ? formatDateParam(getWeekStart(DateTime.now()))
              : prev.date,
        }),
      });
    },
    [navigate],
  );

  const setFilters = useCallback(
    (newFilters: Partial<typeof filters>) => {
      navigate({
        search: (prev) => ({
          ...prev,
          calendarId: newFilters.calendarId ?? prev.calendarId,
          clientId: newFilters.clientId ?? prev.clientId,
          appointmentTypeId:
            newFilters.appointmentTypeId ?? prev.appointmentTypeId,
          status: newFilters.status ?? prev.status,
        }),
      });
    },
    [navigate],
  );

  const clearFilter = useCallback(
    (filterKey: keyof typeof filters) => {
      navigate({
        search: (prev) => ({
          ...prev,
          [filterKey]: undefined,
        }),
      });
    },
    [navigate],
  );

  const clearAllFilters = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        calendarId: undefined,
        clientId: undefined,
        appointmentTypeId: undefined,
        status: undefined,
      }),
    });
  }, [navigate]);

  const setListScope = useCallback(
    (nextScope: ListScope) => {
      navigate({
        search: (prev) => ({
          ...prev,
          listScope: nextScope,
        }),
      });
    },
    [navigate],
  );

  const viewerTimezone = getUserTimezone();

  // Fetch calendars for filter
  const { data: calendarsData } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  // Fetch appointment types for filter
  const { data: typesData } = useQuery({
    ...orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  const hasValidClientFilter = UUID_PATTERN.test(filters.clientId);
  const { data: selectedClientData } = useQuery({
    ...orpc.clients.get.queryOptions({
      input: { id: filters.clientId },
    }),
    enabled: hasValidClientFilter,
    placeholderData: (previous) => previous,
  });

  const { data: orgData } = useQuery({
    ...orpc.org.get.queryOptions({}),
    placeholderData: (previous) => previous,
  });

  const calendars = calendarsData?.items ?? [];
  const appointmentTypes = typesData?.items ?? [];

  const selectedCalendar = calendars.find((c) => c.id === filters.calendarId);
  const selectedType = appointmentTypes.find(
    (t) => t.id === filters.appointmentTypeId,
  );
  const modeFromSearch =
    tzMode && isSchedulingTimezoneMode(tzMode) ? tzMode : null;
  const timezoneMode = modeFromSearch ?? DEFAULT_SCHEDULING_TIMEZONE_MODE;
  const orgDefaultTimezone = orgData?.defaultTimezone ?? "America/New_York";
  const displayTimezone = resolveEffectiveSchedulingTimezone({
    mode: timezoneMode,
    calendarTimezone: selectedCalendar?.timezone,
    selectedTimezone: tz,
    fallbackTimezone: orgDefaultTimezone,
    viewerTimezone,
  });
  const displayTimezoneShort = formatTimezoneShort(displayTimezone);
  const listBoundaryAt = useMemo(
    () =>
      DateTime.now().setZone(displayTimezone).startOf("day").toUTC().toJSDate(),
    [displayTimezone],
  );

  // Fetch appointments for list view
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
  } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        limit: 50,
        scope: listScope,
        boundaryAt: listBoundaryAt,
        ...(filters.calendarId && { calendarId: filters.calendarId }),
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.appointmentTypeId && {
          appointmentTypeId: filters.appointmentTypeId,
        }),
        ...(filters.status && {
          status: filters.status as
            | "scheduled"
            | "confirmed"
            | "cancelled"
            | "no_show",
        }),
      },
    }),
    placeholderData: (previous) => previous,
  });
  const listAppointments = listData?.items ?? [];

  // Parse date param for schedule view or default to current week
  const weekStart = useMemo(() => {
    if (date) {
      const parsed = parseDateParamInTimezone(date, displayTimezone);
      return getWeekStart(parsed);
    }
    return getWeekStart(DateTime.now().setZone(displayTimezone));
  }, [date, displayTimezone]);

  // Fetch appointments for schedule view
  const { appointments: scheduleAppointments, isLoading: scheduleLoading } =
    useScheduleAppointments({
      weekStart,
      displayTimezone,
      filters: {
        calendarId: filters.calendarId || undefined,
        clientId: filters.clientId || undefined,
        appointmentTypeId: filters.appointmentTypeId || undefined,
        status: filters.status || undefined,
      },
      enabled: currentView === "schedule",
    });

  // Week navigation for schedule view
  const goToPreviousWeek = useCallback(() => {
    const newStart = weekStart.minus({ days: 7 });
    navigate({
      search: (prev) => ({
        ...prev,
        date: formatDateParam(newStart),
      }),
    });
  }, [navigate, weekStart]);

  const goToNextWeek = useCallback(() => {
    const newStart = weekStart.plus({ days: 7 });
    navigate({
      search: (prev) => ({
        ...prev,
        date: formatDateParam(newStart),
      }),
    });
  }, [navigate, weekStart]);

  const goToToday = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        date: formatDateParam(
          getWeekStart(DateTime.now().setZone(displayTimezone)),
        ),
      }),
    });
  }, [displayTimezone, navigate]);

  const setTimezoneMode = useCallback(
    (mode: SchedulingTimezoneMode) => {
      navigate({
        search: (prev) => ({
          ...prev,
          tzMode: mode,
          tz:
            mode === "calendar"
              ? (prev.tz ?? selectedCalendar?.timezone ?? orgDefaultTimezone)
              : prev.tz,
        }),
      });
    },
    [navigate, orgDefaultTimezone, selectedCalendar?.timezone],
  );

  const setDisplayTimezone = useCallback(
    (nextTimezone: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          tz: nextTimezone,
        }),
      });
    },
    [navigate],
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setCancellingId(null);
        toast.success("Appointment cancelled");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel appointment");
      },
    }),
  );

  // No-show mutation
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setNoShowId(null);
        toast.success("Appointment marked as no-show");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to mark as no-show");
      },
    }),
  );

  const calendarFilterLabel = resolveSelectValueLabel({
    value: filters.calendarId || "all",
    options: calendars,
    getOptionValue: (calendar) => calendar.id,
    getOptionLabel: (calendar) => calendar.name,
    noneValue: "all",
    noneLabel: "All calendars",
    unknownLabel: "Unknown calendar",
  });
  const typeFilterLabel = resolveSelectValueLabel({
    value: filters.appointmentTypeId || "all",
    options: appointmentTypes,
    getOptionValue: (type) => type.id,
    getOptionLabel: (type) => type.name,
    noneValue: "all",
    noneLabel: "All types",
    unknownLabel: "Unknown appointment type",
  });
  const statusFilterLabel = resolveSelectValueLabel({
    value: filters.status || "all",
    options: STATUS_FILTER_OPTIONS,
    getOptionValue: (status) => status.value,
    getOptionLabel: (status) => status.label,
    noneValue: "all",
    noneLabel: "All statuses",
    unknownLabel: "Unknown status",
  });

  // Check if selected appointment is in list data (full relations available)
  const selectedInList = useMemo(
    () =>
      selectedId ? listAppointments.find((a) => a.id === selectedId) : null,
    [selectedId, listAppointments],
  );

  // Check if selected appointment exists in schedule data (we'll need to fetch full details)
  const selectedInSchedule = useMemo(
    () =>
      selectedId && !selectedInList
        ? scheduleAppointments.find((a) => a.id === selectedId)
        : null,
    [selectedId, selectedInList, scheduleAppointments],
  );

  // Fetch full appointment data when selected from schedule view
  // (schedule data has flattened fields, but detail panel needs nested relations)
  const { data: fetchedAppointment, isLoading: isFetchingAppointment } =
    useQuery({
      ...orpc.appointments.get.queryOptions({ input: { id: selectedId! } }),
      enabled: !!selectedInSchedule && !!selectedId,
    });

  // Use list data if available, otherwise use fetched data
  const selectedAppointment: AppointmentWithRelations | null = useMemo(() => {
    if (!selectedId) return null;
    if (selectedInList) return selectedInList;
    if (fetchedAppointment) return fetchedAppointment;
    return null;
  }, [selectedId, selectedInList, fetchedAppointment]);

  const displayAppointment = useClosingSnapshot(
    selectedAppointment ?? undefined,
  );

  // Build set of appointment IDs for selection validation
  const appointmentIds = useMemo(() => {
    const ids = new Set(listAppointments.map((a) => a.id));
    for (const apt of scheduleAppointments) {
      ids.add(apt.id);
    }
    return ids;
  }, [listAppointments, scheduleAppointments]);

  useValidateSelection(appointmentIds, selectedId, clearDetails);

  // Keyboard navigation for list
  const selectedIndex = selectedId
    ? listAppointments.findIndex((a) => a.id === selectedId)
    : -1;

  useListNavigation({
    items: listAppointments,
    selectedIndex,
    onSelect: (index) => {
      const apt = listAppointments[index];
      if (apt) openDetails(apt.id, "details");
    },
    onOpen: (apt) => openDetails(apt.id, "details"),
    enabled: currentView === "list",
  });

  // Focus zones
  useFocusZones({
    onEscape: clearDetails,
    detailOpen: detailModalOpen,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      { key: "c", action: () => setModalOpen(true), description: "Create" },
      {
        key: "v",
        action: () => setView(currentView === "list" ? "schedule" : "list"),
        description: "Toggle view",
      },
      {
        key: "[",
        action: goToPreviousWeek,
        description: "Previous week",
      },
      {
        key: "]",
        action: goToNextWeek,
        description: "Next week",
      },
      {
        key: "t",
        action: goToToday,
        description: "Go to today",
      },
    ],
  });

  const handleCancel = () => {
    if (!cancellingId) return;
    cancelMutation.mutate({ id: cancellingId });
  };

  const handleNoShow = () => {
    if (!noShowId) return;
    noShowMutation.mutate({ id: noShowId });
  };

  // Active filter count and display
  const activeFilterCount = [
    filters.calendarId,
    filters.clientId,
    filters.appointmentTypeId,
    filters.status,
  ].filter(Boolean).length;

  const activeFiltersDisplay = [
    filters.clientId && {
      label: "Client",
      value: hasValidClientFilter
        ? `${selectedClientData?.firstName ?? ""} ${selectedClientData?.lastName ?? ""}`.trim() ||
          "Unknown client"
        : "Unknown client",
      onRemove: () => clearFilter("clientId"),
    },
    filters.calendarId && {
      label: "Calendar",
      value: selectedCalendar?.name ?? "Unknown",
      onRemove: () => clearFilter("calendarId"),
    },
    filters.appointmentTypeId && {
      label: "Type",
      value: selectedType?.name ?? "Unknown",
      onRemove: () => clearFilter("appointmentTypeId"),
    },
    filters.status && {
      label: "Status",
      value: filters.status.replace("_", " "),
      onRemove: () => clearFilter("status"),
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    onRemove: () => void;
  }>;

  const handleSelectAppointment = useCallback(
    (appointment: AppointmentWithRelations) => {
      openDetails(appointment.id, "details");
    },
    [openDetails],
  );

  const handleSelectScheduleAppointment = useCallback(
    (id: string) => {
      openDetails(id, "details");
    },
    [openDetails],
  );

  const handleOpenClient = useCallback(
    (clientId: string) => {
      navigate({
        to: "/clients",
        search: {
          selected: clientId,
          tab: "details",
        },
      });
    },
    [navigate],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Appointments
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            View and manage scheduled appointments
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle view={currentView} onViewChange={setView} size="sm" />
        {currentView === "list" && (
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setListScope("upcoming")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                listScope === "upcoming"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setListScope("history")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                listScope === "history"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              History
            </button>
          </div>
        )}
        <TimeDisplayToggle
          value={timezoneMode}
          onValueChange={setTimezoneMode}
          size="sm"
        />
        <AppointmentsTimezoneControl
          timezoneMode={timezoneMode}
          displayTimezone={displayTimezone}
          displayTimezoneShort={displayTimezoneShort}
          selectedCalendarTimezone={selectedCalendar?.timezone}
          onTimezoneChange={setDisplayTimezone}
        />
        <Button
          className="hidden h-8 min-w-[210px] justify-center text-sm sm:inline-flex"
          onClick={() => setModalOpen(true)}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span>New Appointment</span>
          <ShortcutBadge shortcut="c" className="ml-2 hidden md:inline-flex" />
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-4">
        <FilterPopover
          activeFilterCount={activeFilterCount}
          onClear={clearAllFilters}
        >
          <FilterField label="Calendar">
            <Select
              value={filters.calendarId || "all"}
              onValueChange={(value) =>
                value &&
                setFilters({ calendarId: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All calendars">
                  {calendarFilterLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All calendars</SelectItem>
                {calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    {cal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Type">
            <Select
              value={filters.appointmentTypeId || "all"}
              onValueChange={(value) =>
                value &&
                setFilters({ appointmentTypeId: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types">
                  {typeFilterLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {appointmentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Status">
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                value && setFilters({ status: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All statuses">
                  {statusFilterLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </FilterPopover>

        {activeFiltersDisplay.length > 0 && (
          <ActiveFilters filters={activeFiltersDisplay} />
        )}
      </div>

      {/* Main Content */}
      <div id={FOCUS_ZONES.LIST} className="mt-6 flex min-h-[600px] flex-col">
        {currentView === "list" ? (
          <AppointmentsList
            appointments={listAppointments}
            displayTimezone={displayTimezone}
            selectedId={selectedId}
            onSelect={handleSelectAppointment}
            onCancel={setCancellingId}
            onNoShow={setNoShowId}
            isLoading={listLoading}
          />
        ) : (
          <div className="flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
            <ScheduleGrid
              appointments={scheduleAppointments}
              displayTimezone={displayTimezone}
              weekStart={weekStart}
              selectedId={selectedId}
              onSelectAppointment={handleSelectScheduleAppointment}
              onPreviousWeek={goToPreviousWeek}
              onNextWeek={goToNextWeek}
              onToday={goToToday}
              isLoading={scheduleLoading}
            />
          </div>
        )}

        {listError && currentView === "list" && (
          <div className="py-10 text-center text-destructive">
            Error loading appointments
          </div>
        )}
      </div>

      <EntityModal
        open={detailModalOpen && !!displayAppointment}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        title={displayAppointment?.appointmentType?.name ?? ""}
        description={
          displayAppointment
            ? formatDisplayDate(displayAppointment.startAt, displayTimezone)
            : undefined
        }
      >
        {displayAppointment ? (
          <div id={FOCUS_ZONES.DETAIL} className="h-full">
            <AppointmentDetail
              appointment={displayAppointment}
              displayTimezone={displayTimezone}
              timezoneMode={timezoneMode}
              onTimezoneModeChange={setTimezoneMode}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onOpenClient={handleOpenClient}
              isLoading={!!selectedInSchedule && isFetchingAppointment}
              showHeader={false}
            />
          </div>
        ) : null}
      </EntityModal>

      {/* Appointment Modal */}
      <AppointmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        timezoneMode={timezoneMode}
        onTimezoneModeChange={setTimezoneMode}
        displayTimezone={displayTimezone}
        defaultTimezone={orgDefaultTimezone}
      />

      {/* Cancel Confirmation */}
      <AlertDialog
        open={!!cancellingId}
        onOpenChange={() => setCancellingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? The client will
              be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Cancel Appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-Show Confirmation */}
      <AlertDialog open={!!noShowId} onOpenChange={() => setNoShowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this appointment as a no-show?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNoShow}>
              {noShowMutation.isPending ? "Saving..." : "Mark as No-Show"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
        <Button className="w-full" onClick={() => setModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Appointment
        </Button>
      </div>
    </div>
  );
}

interface AppointmentsSearchParams {
  create?: "1";
  selected?: string;
  tab?: string;
  view?: "list" | "schedule";
  date?: string;
  calendarId?: string;
  clientId?: string;
  appointmentTypeId?: string;
  status?: string;
  listScope?: ListScope;
  tzMode?: SchedulingTimezoneMode;
  tz?: string;
}

export const Route = createFileRoute("/_authenticated/appointments/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): AppointmentsSearchParams => {
    return {
      create: search.create === "1" ? "1" : undefined,
      selected:
        typeof search.selected === "string" ? search.selected : undefined,
      tab: typeof search.tab === "string" ? search.tab : undefined,
      view:
        typeof search.view === "string" &&
        (search.view === "list" || search.view === "schedule")
          ? search.view
          : undefined,
      date:
        typeof search.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(search.date)
          ? search.date
          : undefined,
      calendarId:
        typeof search.calendarId === "string" ? search.calendarId : undefined,
      clientId:
        typeof search.clientId === "string" ? search.clientId : undefined,
      appointmentTypeId:
        typeof search.appointmentTypeId === "string"
          ? search.appointmentTypeId
          : undefined,
      status: typeof search.status === "string" ? search.status : undefined,
      listScope:
        typeof search.listScope === "string" && isListScope(search.listScope)
          ? search.listScope
          : undefined,
      tzMode:
        typeof search.tzMode === "string" &&
        isSchedulingTimezoneMode(search.tzMode)
          ? search.tzMode
          : undefined,
      tz: typeof search.tz === "string" ? search.tz : undefined,
    };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      (async () => {
        const org = await queryClient.ensureQueryData(
          orpc.org.get.queryOptions({}),
        );
        const prefetchBoundaryAt = DateTime.now()
          .setZone(org.defaultTimezone ?? "America/New_York")
          .startOf("day")
          .toUTC()
          .toJSDate();
        await Promise.all([
          queryClient.ensureQueryData(
            orpc.appointments.list.queryOptions({
              input: {
                limit: 50,
                scope: "upcoming",
                boundaryAt: prefetchBoundaryAt,
              },
            }),
          ),
          queryClient.ensureQueryData(
            orpc.calendars.list.queryOptions({
              input: { limit: 100 },
            }),
          ),
          queryClient.ensureQueryData(
            orpc.appointmentTypes.list.queryOptions({
              input: { limit: 100 },
            }),
          ),
        ]);
      })(),
    );
  },
  component: AppointmentsPage,
});
