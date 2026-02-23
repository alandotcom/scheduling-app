// Appointments page with list/schedule views and modal detail panel

import { useState, useCallback, useMemo, useRef } from "react";
import { DateTime } from "luxon";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import {
  formatDisplayDate,
  formatDisplayDateTime,
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
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { EntityModal } from "@/components/entity-modal";
import { PageScaffold } from "@/components/layout/page-scaffold";
import {
  useKeyboardShortcuts,
  useFocusZones,
  useListNavigation,
  FOCUS_ZONES,
} from "@/hooks/use-keyboard-shortcuts";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { useCreateIntentTrigger } from "@/hooks/use-create-intent";
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
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import { SchedulingControlsSheet } from "@/components/appointments/scheduling-controls-sheet";
import {
  AppointmentCalendarScheduler,
  type AppointmentCalendarRange,
  type AppointmentCalendarSchedulerRef,
} from "@/components/appointments/fullcalendar/scheduler";

type ViewMode = "list" | "schedule";
type DetailTabValue = "details" | "client" | "history" | "workflows";
type ListScope = "upcoming" | "history";
const STATUS_FILTER_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
] as const;
type AppointmentStatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["value"];
const STATUS_FILTER_DOT_CLASS: Record<AppointmentStatusFilter, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-emerald-500",
  cancelled: "bg-slate-400",
  no_show: "bg-amber-500",
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CreateAppointmentPrefill {
  calendarId?: string;
  typeId?: string;
  dateISO?: string;
  startTimeISO?: string;
}

interface PendingCalendarReschedule {
  appointmentId: string;
  oldStartAt: Date;
  oldEndAt: Date;
  newStartAt: Date;
  newEndAt: Date;
  timezone: string;
}

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" ||
  value === "client" ||
  value === "history" ||
  value === "workflows";
const isListScope = (value: string): value is ListScope =>
  value === "upcoming" || value === "history";
const isAppointmentStatusFilter = (
  value: string,
): value is AppointmentStatusFilter =>
  STATUS_FILTER_OPTIONS.some((status) => status.value === value);

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
  } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const currentView: ViewMode = view;
  const listScope: ListScope =
    urlListScope && isListScope(urlListScope) ? urlListScope : "upcoming";

  // Confirmation dialogs
  const schedulerRef = useRef<AppointmentCalendarSchedulerRef | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [noShowId, setNoShowId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createPrefill, setCreatePrefill] =
    useState<CreateAppointmentPrefill | null>(null);
  const [pendingCalendarReschedule, setPendingCalendarReschedule] =
    useState<PendingCalendarReschedule | null>(null);
  const [rescheduleAppointment, setRescheduleAppointment] =
    useState<AppointmentWithRelations | null>(null);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const isCreateModalOpen = modalOpen;
  const openCreateModal = useCallback((prefill?: CreateAppointmentPrefill) => {
    setCreatePrefill(prefill ?? null);
    setModalOpen(true);
  }, []);

  useCreateIntentTrigger("appointments", openCreateModal);

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
  const statusFilter =
    filters.status && isAppointmentStatusFilter(filters.status)
      ? filters.status
      : undefined;

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
          // Set date to today's local date when switching to schedule.
          date:
            newView === "schedule" && !prev.date
              ? formatDateParam(DateTime.now())
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
    isFetching: listFetching,
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
        ...(statusFilter && { status: statusFilter }),
      },
    }),
    placeholderData: (previous) => previous,
  });
  const listAppointments = useMemo(() => listData?.items ?? [], [listData]);

  // Parse active schedule date for FullCalendar navigation.
  const scheduleDate = useMemo(() => {
    if (date) {
      return parseDateParamInTimezone(date, displayTimezone);
    }
    return DateTime.now().setZone(displayTimezone).startOf("day");
  }, [date, displayTimezone]);
  const [scheduleRange, setScheduleRange] = useState<AppointmentCalendarRange>(
    () => {
      const rangeStart = getWeekStart(scheduleDate);
      return {
        rangeStart,
        rangeEnd: rangeStart.plus({ days: 7 }),
        activeDate: scheduleDate,
      };
    },
  );
  const scheduleCalendarIds = useMemo(
    () =>
      filters.calendarId ? [filters.calendarId] : calendars.map((c) => c.id),
    [calendars, filters.calendarId],
  );
  const calendarTimezoneById = useMemo(
    () =>
      Object.fromEntries(
        calendars.map((calendar) => [calendar.id, calendar.timezone]),
      ),
    [calendars],
  );

  // Fetch appointments for schedule view
  const {
    appointments: scheduleAppointments,
    isLoading: scheduleLoading,
    isFetching: scheduleFetching,
  } = useScheduleAppointments({
    rangeStart: scheduleRange.rangeStart,
    rangeEnd: scheduleRange.rangeEnd,
    displayTimezone,
    filters: {
      calendarId: filters.calendarId || undefined,
      clientId: filters.clientId || undefined,
      appointmentTypeId: filters.appointmentTypeId || undefined,
      status: statusFilter,
    },
    enabled: currentView === "schedule",
  });

  const { data: availabilityFeedData } = useQuery({
    ...orpc.availability.feed.queryOptions({
      input: {
        calendarIds: scheduleCalendarIds,
        startAt: scheduleRange.rangeStart.toJSDate(),
        endAt: scheduleRange.rangeEnd.toJSDate(),
        timezone: displayTimezone,
      },
    }),
    enabled: currentView === "schedule" && scheduleCalendarIds.length > 0,
    placeholderData: (previous) => previous,
  });
  const availabilityFeedItems = availabilityFeedData?.items ?? [];

  const handleScheduleRangeChange = useCallback(
    (nextRange: AppointmentCalendarRange) => {
      setScheduleRange((previous) => {
        const sameRange =
          previous.rangeStart.toMillis() === nextRange.rangeStart.toMillis() &&
          previous.rangeEnd.toMillis() === nextRange.rangeEnd.toMillis() &&
          previous.activeDate.hasSame(nextRange.activeDate, "day");
        return sameRange ? previous : nextRange;
      });

      const nextDate = formatDateParam(nextRange.activeDate);
      navigate({
        search: (previous) => {
          if (previous.date === nextDate) {
            return previous;
          }
          return {
            ...previous,
            date: nextDate,
          };
        },
        replace: true,
      });
    },
    [navigate],
  );

  const goToPreviousPeriod = useCallback(() => {
    schedulerRef.current?.goToPrevious();
  }, []);

  const goToNextPeriod = useCallback(() => {
    schedulerRef.current?.goToNext();
  }, []);

  const goToToday = useCallback(() => {
    schedulerRef.current?.goToToday();
  }, []);

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
  const confirmMutation = useMutation(
    orpc.appointments.confirm.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setConfirmingId(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to confirm appointment");
      },
    }),
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setCancellingId(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel appointment");
      },
    }),
  );

  const calendarRescheduleMutation = useMutation(
    orpc.appointments.reschedule.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setPendingCalendarReschedule(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to reschedule appointment");
      },
    }),
  );

  // No-show mutation
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setNoShowId(null);
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
  const calendarColorById = useMemo(() => {
    const colors = new Map<string, string>();
    for (const appointment of scheduleAppointments) {
      if (appointment.calendarColor && !colors.has(appointment.calendarId)) {
        colors.set(appointment.calendarId, appointment.calendarColor);
      }
    }
    return colors;
  }, [scheduleAppointments]);

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
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedAppointment,
    });

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
      }),
      replace: true,
    });
  }, [closeDetailModalNow, navigate]);

  // Build set of appointment IDs for selection validation
  const appointmentIds = useMemo(() => {
    const ids = new Set(listAppointments.map((a) => a.id));
    for (const apt of scheduleAppointments) {
      ids.add(apt.id);
    }
    return ids;
  }, [listAppointments, scheduleAppointments]);

  const isSelectionDataResolved =
    !listLoading &&
    !listError &&
    !listFetching &&
    (currentView !== "schedule" || (!scheduleLoading && !scheduleFetching)) &&
    (!selectedInSchedule || !isFetchingAppointment);

  useValidateSelection({
    items: appointmentIds,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

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
      { key: "c", action: openCreateModal, description: "Create" },
      {
        key: "v",
        action: () => setView(currentView === "list" ? "schedule" : "list"),
        description: "Toggle view",
      },
      {
        key: "[",
        action: goToPreviousPeriod,
        description: "Previous period",
      },
      {
        key: "]",
        action: goToNextPeriod,
        description: "Next period",
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

  const handleConfirm = () => {
    if (!confirmingId) return;
    confirmMutation.mutate({ id: confirmingId });
  };

  const handleNoShow = () => {
    if (!noShowId) return;
    noShowMutation.mutate({ id: noShowId });
  };

  const handleCalendarRescheduleConfirm = () => {
    if (!pendingCalendarReschedule) return;
    calendarRescheduleMutation.mutate({
      id: pendingCalendarReschedule.appointmentId,
      newStartTime: pendingCalendarReschedule.newStartAt,
      timezone: pendingCalendarReschedule.timezone,
    });
  };

  // Active filter count and display
  const activeFilterCount = [
    filters.calendarId,
    filters.clientId,
    filters.appointmentTypeId,
    statusFilter,
  ].filter(Boolean).length;

  const activeFiltersDisplay: Array<{
    label: string;
    value: string;
    onRemove: () => void;
  }> = [];
  if (filters.clientId) {
    activeFiltersDisplay.push({
      label: "Client",
      value: hasValidClientFilter
        ? `${selectedClientData?.firstName ?? ""} ${selectedClientData?.lastName ?? ""}`.trim() ||
          "Unknown client"
        : "Unknown client",
      onRemove: () => clearFilter("clientId"),
    });
  }
  if (filters.calendarId) {
    activeFiltersDisplay.push({
      label: "Calendar",
      value: selectedCalendar?.name ?? "Unknown",
      onRemove: () => clearFilter("calendarId"),
    });
  }
  if (filters.appointmentTypeId) {
    activeFiltersDisplay.push({
      label: "Type",
      value: selectedType?.name ?? "Unknown",
      onRemove: () => clearFilter("appointmentTypeId"),
    });
  }
  if (statusFilter) {
    activeFiltersDisplay.push({
      label: "Status",
      value: statusFilter.replace("_", " "),
      onRemove: () => clearFilter("status"),
    });
  }
  const scheduleActiveFiltersDisplay = activeFiltersDisplay.filter(
    (filter) => filter.label === "Client",
  );
  const mobileTimezoneSummaryLabel =
    timezoneMode === "viewer"
      ? "My time"
      : selectedCalendar?.timezone
        ? "Calendar timezone"
        : "Calendar time";

  const handleSelectAppointment = useCallback(
    (appointment: AppointmentWithRelations) => {
      openDetails(appointment.id, "details");
    },
    [openDetails],
  );

  const handleRescheduleFromList = useCallback(
    (appointment: AppointmentWithRelations) => {
      setRescheduleAppointment(appointment);
    },
    [],
  );

  const handleSelectScheduleAppointment = useCallback(
    (id: string) => {
      openDetails(id, "details");
    },
    [openDetails],
  );

  const handleCreateFromScheduleSlot = useCallback(
    ({ startAt }: { startAt: Date; endAt: Date }) => {
      const defaultCalendarId = filters.calendarId || calendars[0]?.id;
      const slotDate = DateTime.fromJSDate(startAt, {
        zone: displayTimezone,
      });

      openCreateModal({
        calendarId: defaultCalendarId,
        typeId: filters.appointmentTypeId || undefined,
        dateISO: slotDate.toISODate() ?? undefined,
        startTimeISO: slotDate.toISO() ?? undefined,
      });
    },
    [
      calendars,
      displayTimezone,
      filters.appointmentTypeId,
      filters.calendarId,
      openCreateModal,
    ],
  );

  const handleCalendarRescheduleRequest = useCallback(
    (input: PendingCalendarReschedule) => {
      setPendingCalendarReschedule(input);
    },
    [],
  );

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

  const handleOpenWorkflowRun = useCallback(
    (input: { workflowId: string; runId: string }) => {
      navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: input.workflowId },
        search: {
          sidebarTab: "runs",
          runId: input.runId,
        },
      });
    },
    [navigate],
  );

  const renderCalendarFilterField = () => (
    <FilterField label="Calendar">
      <Select
        value={filters.calendarId || "all"}
        onValueChange={(value) =>
          value && setFilters({ calendarId: value === "all" ? "" : value })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All calendars">
            {calendarFilterLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All calendars</SelectItem>
          {calendars.map((cal) => {
            const color = calendarColorById.get(cal.id);
            return (
              <SelectItem key={cal.id} value={cal.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: color ?? "var(--color-muted-foreground)",
                    }}
                  />
                  <span>{cal.name}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FilterField>
  );

  const renderTypeFilterField = () => (
    <FilterField label="Type">
      <Select
        value={filters.appointmentTypeId || "all"}
        onValueChange={(value) =>
          value &&
          setFilters({ appointmentTypeId: value === "all" ? "" : value })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All types">{typeFilterLabel}</SelectValue>
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
  );

  const renderStatusFilterField = () => (
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
          {STATUS_FILTER_OPTIONS.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    STATUS_FILTER_DOT_CLASS[status.value],
                  )}
                />
                <span>{status.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );

  const filterPopoverContent = (
    <>
      {renderCalendarFilterField()}
      {renderTypeFilterField()}
      {renderStatusFilterField()}
    </>
  );

  return (
    <PageScaffold className="pb-24 sm:pb-6">
      <div className="hidden mt-2 items-center gap-2 sm:flex sm:flex-nowrap sm:overflow-x-auto sm:pb-1">
        <div className="shrink-0">
          <ViewToggle view={currentView} onViewChange={setView} size="sm" />
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center rounded-lg border border-border bg-muted/30 p-0.5",
            currentView !== "list" && "invisible pointer-events-none",
          )}
          aria-hidden={currentView !== "list"}
        >
          <button
            type="button"
            onClick={() => setListScope("upcoming")}
            className={cn(
              "h-10 rounded-md px-3 text-sm font-medium transition-colors md:h-8",
              listScope === "upcoming"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            tabIndex={currentView === "list" ? 0 : -1}
          >
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => setListScope("history")}
            className={cn(
              "h-10 rounded-md px-3 text-sm font-medium transition-colors md:h-8",
              listScope === "history"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            tabIndex={currentView === "list" ? 0 : -1}
          >
            History
          </button>
        </div>
        <TimeDisplayToggle
          value={timezoneMode}
          onValueChange={setTimezoneMode}
          size="sm"
          className="shrink-0"
        />
        <AppointmentsTimezoneControl
          timezoneMode={timezoneMode}
          displayTimezone={displayTimezone}
          displayTimezoneShort={displayTimezoneShort}
          selectedCalendarTimezone={selectedCalendar?.timezone}
          onTimezoneChange={setDisplayTimezone}
        />
        {currentView === "schedule" ? (
          <>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={filters.calendarId || "all"}
                onValueChange={(value) =>
                  value &&
                  setFilters({ calendarId: value === "all" ? "" : value })
                }
              >
                <SelectTrigger size="sm" className="w-[10.5rem]">
                  <SelectValue placeholder="All calendars">
                    {filters.calendarId ? (
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              calendarColorById.get(filters.calendarId) ??
                              "var(--color-muted-foreground)",
                          }}
                        />
                        <span className="truncate">{calendarFilterLabel}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="flex -space-x-1">
                          {calendars.slice(0, 3).map((cal) => (
                            <span
                              key={cal.id}
                              className="size-2 rounded-full ring-1 ring-background"
                              style={{
                                backgroundColor:
                                  calendarColorById.get(cal.id) ??
                                  "var(--color-muted-foreground)",
                              }}
                            />
                          ))}
                        </span>
                        <span className="truncate">All calendars</span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calendars</SelectItem>
                  {calendars.map((cal) => {
                    const color = calendarColorById.get(cal.id);
                    return (
                      <SelectItem key={cal.id} value={cal.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                color ?? "var(--color-muted-foreground)",
                            }}
                          />
                          <span>{cal.name}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select
                value={filters.status || "all"}
                onValueChange={(value) =>
                  value && setFilters({ status: value === "all" ? "" : value })
                }
              >
                <SelectTrigger size="sm" className="w-[9rem]">
                  <SelectValue placeholder="All statuses">
                    {statusFilterLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_FILTER_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            STATUS_FILTER_DOT_CLASS[status.value],
                          )}
                        />
                        <span>{status.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.appointmentTypeId || "all"}
                onValueChange={(value) =>
                  value &&
                  setFilters({
                    appointmentTypeId: value === "all" ? "" : value,
                  })
                }
              >
                <SelectTrigger size="sm" className="w-[9rem]">
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
            </div>

            {scheduleActiveFiltersDisplay.length > 0 ? (
              <ActiveFilters filters={scheduleActiveFiltersDisplay} />
            ) : null}
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "space-y-2 sm:hidden",
          currentView === "schedule" ? "mt-2" : "mt-6",
        )}
      >
        <div className="flex items-center gap-2">
          <ViewToggle view={currentView} onViewChange={setView} size="sm" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
            onClick={() => setMobileControlsOpen(true)}
          >
            Controls
            {activeFilterCount > 0 ? (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>
        <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">
          <span className="text-muted-foreground">
            {mobileTimezoneSummaryLabel}
          </span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span>{displayTimezoneShort}</span>
        </div>
      </div>

      {/* Filters */}
      {currentView === "list" ? (
        <div className="mt-6 hidden items-center gap-4 sm:flex">
          <FilterPopover
            activeFilterCount={activeFilterCount}
            onClear={clearAllFilters}
          >
            {filterPopoverContent}
          </FilterPopover>

          {activeFiltersDisplay.length > 0 ? (
            <ActiveFilters filters={activeFiltersDisplay} />
          ) : null}
        </div>
      ) : null}

      <SchedulingControlsSheet
        open={mobileControlsOpen}
        onOpenChange={setMobileControlsOpen}
        currentView={currentView}
        listScope={listScope}
        onListScopeChange={setListScope}
        timezoneMode={timezoneMode}
        onTimezoneModeChange={setTimezoneMode}
        displayTimezone={displayTimezone}
        displayTimezoneShort={displayTimezoneShort}
        selectedCalendarTimezone={selectedCalendar?.timezone}
        onTimezoneChange={setDisplayTimezone}
        filters={{
          calendarId: filters.calendarId,
          appointmentTypeId: filters.appointmentTypeId,
          status: filters.status,
        }}
        onFilterChange={setFilters}
        calendars={calendars}
        appointmentTypes={appointmentTypes}
        calendarFilterLabel={calendarFilterLabel}
        typeFilterLabel={typeFilterLabel}
        statusFilterLabel={statusFilterLabel}
        activeFilterCount={activeFilterCount}
        activeFiltersDisplay={activeFiltersDisplay}
        onClearAllFilters={clearAllFilters}
      />

      {/* Main Content */}
      <div
        id={FOCUS_ZONES.LIST}
        className={cn(
          "flex min-h-[600px] flex-col",
          currentView === "schedule" ? "mt-2" : "mt-6",
        )}
      >
        {currentView === "list" ? (
          <AppointmentsList
            appointments={listAppointments}
            displayTimezone={displayTimezone}
            selectedId={selectedId}
            onSelect={handleSelectAppointment}
            onReschedule={handleRescheduleFromList}
            onConfirm={setConfirmingId}
            onCancel={setCancellingId}
            onNoShow={setNoShowId}
            isLoading={listLoading}
            onCreate={openCreateModal}
            showCreateInEmptyState={
              activeFilterCount === 0 && listScope === "upcoming"
            }
          />
        ) : (
          <div className="h-[clamp(35rem,calc(100dvh-12.25rem),68rem)] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <AppointmentCalendarScheduler
              ref={schedulerRef}
              appointments={scheduleAppointments}
              availabilityItems={availabilityFeedItems}
              displayTimezone={displayTimezone}
              initialDate={scheduleDate}
              selectedId={selectedId}
              calendarTimezoneById={calendarTimezoneById}
              onRangeChange={handleScheduleRangeChange}
              onSelectAppointment={handleSelectScheduleAppointment}
              onCreateFromSlot={handleCreateFromScheduleSlot}
              onRequestConfirm={setConfirmingId}
              onRequestCancel={setCancellingId}
              onRequestNoShow={setNoShowId}
              onRequestReschedule={handleCalendarRescheduleRequest}
              isLoading={scheduleLoading}
              isRefreshing={!scheduleLoading && scheduleFetching}
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
        headerActions={
          displayAppointment ? (
            <CopyIdHeaderAction
              id={displayAppointment.id}
              entityLabel="appointment"
            />
          ) : null
        }
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
              onOpenWorkflowRun={handleOpenWorkflowRun}
              isLoading={!!selectedInSchedule && isFetchingAppointment}
              showHeader={false}
            />
          </div>
        ) : null}
      </EntityModal>

      {/* Appointment Modal */}
      <AppointmentModal
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setCreatePrefill(null);
          }
        }}
        defaultCalendarId={createPrefill?.calendarId}
        defaultTypeId={createPrefill?.typeId}
        prefillDateISO={createPrefill?.dateISO}
        prefillStartTimeISO={createPrefill?.startTimeISO}
        timezoneMode={timezoneMode}
        onTimezoneModeChange={setTimezoneMode}
        displayTimezone={displayTimezone}
        defaultTimezone={orgDefaultTimezone}
        onCreated={handleAppointmentCreated}
      />

      {rescheduleAppointment ? (
        <RescheduleDialog
          appointment={rescheduleAppointment}
          open={!!rescheduleAppointment}
          onOpenChange={(open) => {
            if (!open) {
              setRescheduleAppointment(null);
            }
          }}
          timezoneMode={timezoneMode}
          onTimezoneModeChange={setTimezoneMode}
          displayTimezone={displayTimezone}
          defaultTimezone={
            rescheduleAppointment.calendar?.timezone ??
            rescheduleAppointment.timezone
          }
        />
      ) : null}

      {/* Confirm Status Change */}
      <AlertDialog
        open={!!confirmingId}
        onOpenChange={() => setConfirmingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this appointment as confirmed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Scheduled</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {confirmMutation.isPending ? "Confirming..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drag Reschedule Confirmation */}
      <AlertDialog
        open={!!pendingCalendarReschedule}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCalendarReschedule(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reschedule Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCalendarReschedule
                ? `Change this appointment from ${formatDisplayDateTime(
                    pendingCalendarReschedule.oldStartAt,
                    displayTimezone,
                  )} to ${formatDisplayDateTime(
                    pendingCalendarReschedule.newStartAt,
                    displayTimezone,
                  )}?`
                : "Confirm the new appointment time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Original Time</AlertDialogCancel>
            <AlertDialogAction onClick={handleCalendarRescheduleConfirm}>
              {calendarRescheduleMutation.isPending
                ? "Rescheduling..."
                : "Reschedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={() => openCreateModal()}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Appointment
        </Button>
      </div>
    </PageScaffold>
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
  listScope?: ListScope;
  tzMode?: SchedulingTimezoneMode;
  tz?: string;
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
