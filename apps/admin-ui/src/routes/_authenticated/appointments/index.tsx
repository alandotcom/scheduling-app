// Appointments page with split-pane layout and list/schedule toggle

import { useState, useCallback, useMemo } from "react";
import { DateTime } from "luxon";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";

import { Icon } from "@/components/ui/icon";
import { getQueryClient, orpc } from "@/lib/query";
import { formatDisplayDate } from "@/lib/date-utils";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { Button } from "@/components/ui/button";
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
import {
  DetailPanel,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";
import { AppointmentModal } from "@/components/appointment-modal";
import {
  useKeyboardShortcuts,
  useFocusZones,
  useListNavigation,
  FOCUS_ZONES,
} from "@/hooks/use-keyboard-shortcuts";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import {
  useScheduleAppointments,
  getWeekStart,
  formatDateParam,
  parseDateParam,
} from "@/hooks/use-schedule-appointments";
import { ViewToggle } from "@/components/appointments/view-toggle";
import { AppointmentsList } from "@/components/appointments/appointments-list";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { ScheduleGrid } from "@/components/appointments/schedule-grid";

type ViewMode = "list" | "schedule";
type DetailTabValue = "details" | "client" | "history";
const STATUS_FILTER_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
] as const;

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "client" || value === "history";

function AppointmentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    selected,
    tab,
    view = "list",
    date,
    calendarId: urlCalendarId,
    appointmentTypeId: urlAppointmentTypeId,
    status: urlStatus,
  } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const detailOpen = !!selectedId;
  const currentView: ViewMode = view;

  // Parse date param for schedule view or default to current week
  const weekStart = useMemo(() => {
    if (date) {
      const parsed = parseDateParam(date);
      return getWeekStart(parsed);
    }
    return getWeekStart(DateTime.now());
  }, [date]);

  // Confirmation dialogs
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [noShowId, setNoShowId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters from URL
  const filters = useMemo(
    () => ({
      calendarId: urlCalendarId ?? "",
      appointmentTypeId: urlAppointmentTypeId ?? "",
      status: urlStatus ?? "",
    }),
    [urlCalendarId, urlAppointmentTypeId, urlStatus],
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
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
      }),
    });
  }, [navigate]);

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
        appointmentTypeId: undefined,
        status: undefined,
      }),
    });
  }, [navigate]);

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
        date: formatDateParam(getWeekStart(DateTime.now())),
      }),
    });
  }, [navigate]);

  // Fetch appointments for list view
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
  } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        limit: 50,
        ...(filters.calendarId && { calendarId: filters.calendarId }),
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

  // Fetch appointments for schedule view
  const { appointments: scheduleAppointments, isLoading: scheduleLoading } =
    useScheduleAppointments({
      weekStart,
      filters: {
        calendarId: filters.calendarId || undefined,
        appointmentTypeId: filters.appointmentTypeId || undefined,
        status: filters.status || undefined,
      },
      enabled: currentView === "schedule",
    });

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

  const calendars = calendarsData?.items ?? [];
  const appointmentTypes = typesData?.items ?? [];
  const listAppointments = listData?.items ?? [];

  const selectedCalendar = calendars.find((c) => c.id === filters.calendarId);
  const selectedType = appointmentTypes.find(
    (t) => t.id === filters.appointmentTypeId,
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
    detailOpen,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+n", "ctrl+n"],
        action: () => setModalOpen(true),
        description: "New appointment",
      },
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
    filters.appointmentTypeId,
    filters.status,
  ].filter(Boolean).length;

  const activeFiltersDisplay = [
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Appointments
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            View and manage all appointments
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ViewToggle view={currentView} onViewChange={setView} />
          <Button onClick={() => setModalOpen(true)}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">New Appointment</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
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
      <WorkbenchLayout className="mt-6 min-h-[600px]">
        <ListPanel id={FOCUS_ZONES.LIST} className="flex flex-col">
          {currentView === "list" ? (
            <AppointmentsList
              appointments={listAppointments}
              selectedId={selectedId}
              onSelect={handleSelectAppointment}
              onCancel={setCancellingId}
              onNoShow={setNoShowId}
              isLoading={listLoading}
            />
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm flex-1">
              <ScheduleGrid
                appointments={scheduleAppointments}
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
            <div className="text-center text-destructive py-10">
              Error loading appointments
            </div>
          )}
        </ListPanel>

        <DetailPanel
          id={FOCUS_ZONES.DETAIL}
          open={detailOpen}
          storageKey="appointments"
          onOpenChange={(open) => {
            if (!open) clearDetails();
          }}
          sheetTitle={
            selectedAppointment?.appointmentType?.name ?? "Appointment details"
          }
          sheetDescription={
            selectedAppointment
              ? formatDisplayDate(selectedAppointment.startAt)
              : undefined
          }
          bodyClassName="p-0"
        >
          {detailOpen && (
            <AppointmentDetail
              appointment={selectedAppointment}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isLoading={!!selectedInSchedule && isFetchingAppointment}
            />
          )}
        </DetailPanel>
      </WorkbenchLayout>

      {/* Appointment Modal */}
      <AppointmentModal open={modalOpen} onOpenChange={setModalOpen} />

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
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
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
    </div>
  );
}

interface AppointmentsSearchParams {
  selected?: string;
  tab?: string;
  view?: "list" | "schedule";
  date?: string;
  calendarId?: string;
  clientId?: string;
  appointmentTypeId?: string;
  status?: string;
}

export const Route = createFileRoute("/_authenticated/appointments/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): AppointmentsSearchParams => {
    return {
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
    };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await Promise.all([
      queryClient.ensureQueryData(
        orpc.appointments.list.queryOptions({
          input: { limit: 50 },
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
  },
  component: AppointmentsPage,
});
