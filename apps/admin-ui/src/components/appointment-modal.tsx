// Appointment booking modal with availability calendar

import { useEffect, useState, useMemo } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import {
  formatDateISO,
  formatDisplayDateTime,
  formatTimezoneShort,
  formatTimeDisplay,
  getUserTimezone,
  getMonthDays,
} from "@/lib/date-utils";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  resolveEffectiveSchedulingTimezone,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildDayAvailabilityMap,
  filterAvailableSlotsForDate,
  getDayAvailabilityLevel,
} from "@/components/appointments/day-availability";
import { AvailabilityManageModal } from "@/components/availability/availability-manage-modal";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCalendarId?: string;
  defaultCalendarName?: string;
  defaultTypeId?: string;
  defaultClientId?: string;
  defaultClientName?: string;
  timezoneMode?: SchedulingTimezoneMode;
  onTimezoneModeChange?: (mode: SchedulingTimezoneMode) => void;
  displayTimezone?: string;
  defaultTimezone?: string;
}

export function AppointmentModal({
  open,
  onOpenChange,
  defaultCalendarId,
  defaultCalendarName,
  defaultTypeId,
  defaultClientId,
  defaultClientName,
  timezoneMode: controlledTimezoneMode,
  onTimezoneModeChange,
  displayTimezone,
  defaultTimezone,
}: AppointmentModalProps) {
  const queryClient = useQueryClient();
  const viewerTimezone = getUserTimezone();
  const [localTimezoneMode, setLocalTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);
  const [selectedTypeId, setSelectedTypeId] = useState(defaultTypeId ?? "");
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    defaultCalendarId ?? "",
  );
  const [selectedDate, setSelectedDate] = useState<DateTime | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [clientSearch, setClientSearch] = useState(defaultClientName ?? "");
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId ?? "",
  );
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const timezoneMode = controlledTimezoneMode ?? localTimezoneMode;
  const selectedDisplayTimezone = displayTimezone ?? defaultTimezone;

  useEffect(() => {
    if (!open) return;
    setClientSearch(defaultClientName ?? "");
    setSelectedClientId(defaultClientId ?? "");
  }, [open, defaultClientId, defaultClientName]);

  // Current month for calendar
  const [viewMonth, setViewMonth] = useState(() => {
    return DateTime.now().startOf("month");
  });

  // Fetch appointment types
  const { data: typesData } = useQuery({
    ...orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: open,
  });

  // Fetch calendars linked to the selected type
  const { data: linkedCalendars, isLoading: calendarsLoading } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId: selectedTypeId },
    }),
    enabled: open && !!selectedTypeId,
  });
  const calendars = linkedCalendars?.map((l) => l.calendar) ?? [];
  const selectedCalendar = calendars.find((calendar) => {
    return calendar.id === selectedCalendarId;
  });
  const effectiveTimezone = resolveEffectiveSchedulingTimezone({
    mode: timezoneMode,
    calendarTimezone: selectedCalendar?.timezone,
    selectedTimezone: selectedDisplayTimezone,
    fallbackTimezone: defaultTimezone,
    viewerTimezone,
  });
  // Business logic (availability + booking validation) must stay in calendar time.
  const schedulingTimezone = selectedCalendar?.timezone ?? effectiveTimezone;
  const timezoneShortLabel = formatTimezoneShort(
    effectiveTimezone,
    selectedTime,
  );

  // Fetch clients for search
  const { data: clientsData } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: clientSearch, limit: 10 },
    }),
    enabled: open && clientSearch.length >= 2,
  });

  // Fetch available time slots for visible month
  const monthStartDateStr = viewMonth.startOf("month").toISODate() ?? "";
  const monthEndDateStr = viewMonth.endOf("month").toISODate() ?? "";
  const selectedDateStr = selectedDate ? formatDateISO(selectedDate) : "";
  const {
    data: slotsData,
    isLoading: slotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: selectedTypeId,
        calendarIds: [selectedCalendarId],
        startDate: monthStartDateStr,
        endDate: monthEndDateStr,
        timezone: schedulingTimezone,
      },
    }),
    enabled:
      open &&
      !!selectedTypeId &&
      !!selectedCalendarId &&
      !!selectedCalendar &&
      !!monthStartDateStr &&
      !!monthEndDateStr,
  });

  // Create appointment mutation
  const createMutation = useMutation(
    orpc.appointments.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        toast.success("Appointment booked successfully");
        handleClose();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to book appointment");
      },
    }),
  );

  const appointmentTypes = typesData?.items ?? [];
  const clients = clientsData?.items ?? [];
  const monthSlots = slotsData?.slots ?? [];
  const dayAvailabilityCounts = useMemo(
    () => buildDayAvailabilityMap(monthSlots, schedulingTimezone),
    [monthSlots, schedulingTimezone],
  );
  const availableSlots = useMemo(
    () =>
      selectedDateStr
        ? filterAvailableSlotsForDate(
            monthSlots,
            selectedDateStr,
            schedulingTimezone,
          )
        : [],
    [monthSlots, selectedDateStr, schedulingTimezone],
  );

  const appointmentTypeSelectLabel = resolveSelectValueLabel({
    value: selectedTypeId,
    options: appointmentTypes,
    getOptionValue: (type) => type.id,
    getOptionLabel: (type) => `${type.name} (${type.durationMin} min)`,
    unknownLabel: "Unknown appointment type",
  });
  const calendarSelectLabel = resolveSelectValueLabel({
    value: selectedCalendarId,
    options: calendars,
    getOptionValue: (calendar) => calendar.id,
    getOptionLabel: (calendar) => calendar.name,
    unknownLabel: defaultCalendarName ?? "Unknown calendar",
  });
  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = viewMonth.year;
    const month = viewMonth.month - 1;
    const days = getMonthDays(year, month);
    const today = DateTime.now().startOf("day");

    return days.map((date) => ({
      date,
      isCurrentMonth: date.month === month + 1,
      isToday: date.hasSame(today, "day"),
      isPast: date < today,
    }));
  }, [viewMonth]);

  const handleClose = () => {
    setAvailabilityModalOpen(false);
    setSelectedTypeId(defaultTypeId ?? "");
    setSelectedCalendarId(defaultCalendarId ?? "");
    setSelectedDate(null);
    setSelectedTime("");
    setNotes("");
    setClientSearch("");
    setSelectedClientId("");
    onOpenChange(false);
  };

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleCalendarChange = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleDateSelect = (date: DateTime) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleSubmit = () => {
    if (!selectedTime) return;

    createMutation.mutate({
      calendarId: selectedCalendarId,
      appointmentTypeId: selectedTypeId,
      startTime: DateTime.fromISO(selectedTime, { setZone: true }).toJSDate(),
      timezone: schedulingTimezone,
      notes: notes || undefined,
      clientId: selectedClientId || undefined,
    });
  };

  const openCalendarAvailability = (calendarId: string) => {
    if (!calendarId) return;
    setAvailabilityModalOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedTime("");
  }, [open, timezoneMode]);

  useEffect(() => {
    if (open) return;
    setAvailabilityModalOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDate || !selectedTime || slotsLoading) return;

    const stillAvailable = availableSlots.some((slot) => {
      return slot.start === selectedTime;
    });
    if (!stillAvailable) {
      setSelectedTime("");
    }
  }, [availableSlots, open, selectedDate, selectedTime, slotsLoading]);

  useEffect(() => {
    if (!open || !selectedTypeId || calendarsLoading) return;

    const hasSelectedCalendar = calendars.some(
      (calendar) => calendar.id === selectedCalendarId,
    );
    if (selectedCalendarId && !hasSelectedCalendar) {
      setSelectedCalendarId("");
      setSelectedDate(null);
      setSelectedTime("");
      return;
    }

    if (!selectedCalendarId && defaultCalendarId) {
      const hasDefaultCalendar = calendars.some(
        (calendar) => calendar.id === defaultCalendarId,
      );
      if (hasDefaultCalendar) {
        setSelectedCalendarId(defaultCalendarId);
      }
    }
  }, [
    calendars,
    calendarsLoading,
    defaultCalendarId,
    open,
    selectedCalendarId,
    selectedTypeId,
  ]);

  const formatTime = (isoString: string) => {
    return formatTimeDisplay(isoString, effectiveTimezone);
  };

  const formatSelectedDateTime = () => {
    if (!selectedTime) return "";
    return formatDisplayDateTime(selectedTime, effectiveTimezone);
  };

  const canBook = selectedTypeId && selectedCalendarId && selectedTime;

  return (
    <>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        modal="trap-focus"
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-slot="appointment-modal-backdrop"
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              "data-open:animate-in data-open:fade-in-0 duration-100",
            )}
          />
          <DialogPrimitive.Popup
            data-slot="appointment-modal-content"
            className={cn(
              "fixed left-1/2 top-2 z-50 w-[calc(100vw-1rem)] max-w-2xl -translate-x-1/2 sm:top-8 sm:w-full",
              "rounded-xl border border-border bg-background shadow-xl",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 duration-150",
              "max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col sm:h-[min(86dvh,52rem)] sm:max-h-[calc(100dvh-4rem)] sm:min-h-[36rem]",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
              <DialogPrimitive.Title className="text-lg font-medium">
                New Appointment
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Close</span>
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </DialogPrimitive.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Type & Calendar Selection */}
              <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Appointment Type</Label>
                  <Select
                    value={selectedTypeId}
                    onValueChange={(v) => v && handleTypeChange(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type">
                        {appointmentTypeSelectLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {appointmentTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name} ({type.durationMin} min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Calendar</Label>
                  <Select
                    value={selectedCalendarId}
                    onValueChange={(v) => v && handleCalendarChange(v)}
                    disabled={!selectedTypeId || calendarsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          calendarsLoading ? "Loading..." : "Select calendar"
                        }
                      >
                        {calendarSelectLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((cal) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          {cal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mb-5 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:mb-6">
                <div className="space-y-2">
                  <Label>Time Display</Label>
                  <TimeDisplayToggle
                    value={timezoneMode}
                    onValueChange={(value) => {
                      if (onTimezoneModeChange) {
                        onTimezoneModeChange(value);
                        return;
                      }
                      setLocalTimezoneMode(value);
                    }}
                    className="w-full sm:w-fit"
                  />
                  <p
                    className="text-sm text-muted-foreground"
                    title={effectiveTimezone}
                  >
                    Showing{" "}
                    {timezoneMode === "viewer" ? "your local" : "calendar"} time
                    ({timezoneShortLabel})
                  </p>
                </div>
              </div>

              {/* Calendar and Time Selection */}
              {selectedCalendarId && (
                <div className="mb-5 grid grid-cols-1 gap-5 sm:mb-6 sm:grid-cols-2 sm:gap-6">
                  {/* Calendar */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">
                        {viewMonth.toLocaleString({
                          month: "long",
                          year: "numeric",
                        })}
                      </h3>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setViewMonth((prev) => prev.minus({ months: 1 }))
                          }
                        >
                          <Icon icon={ArrowLeft02Icon} className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setViewMonth((prev) => prev.plus({ months: 1 }))
                          }
                        >
                          <Icon icon={ArrowRight02Icon} className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                        <div
                          key={day}
                          className="p-2 text-xs font-medium text-muted-foreground"
                        >
                          {day}
                        </div>
                      ))}
                      {calendarDays.map((day, i) => {
                        if (!day.isCurrentMonth) {
                          return (
                            <div
                              key={i}
                              className="p-2"
                              aria-hidden="true"
                              data-slot="calendar-empty-day"
                            />
                          );
                        }

                        const isSelected =
                          selectedDate && day.date.hasSame(selectedDate, "day");
                        const dayDateKey = formatDateISO(day.date);
                        const availabilityLevel = day.isPast
                          ? "none"
                          : getDayAvailabilityLevel(
                              dayAvailabilityCounts.get(dayDateKey) ?? 0,
                            );
                        return (
                          <button
                            key={i}
                            type="button"
                            data-availability={availabilityLevel}
                            disabled={day.isPast}
                            onClick={() => handleDateSelect(day.date)}
                            className={cn(
                              "p-2 text-sm rounded-md border border-transparent transition-colors",
                              "text-foreground",
                              day.isPast && "opacity-50 cursor-not-allowed",
                              day.isToday && "ring-1 ring-primary",
                              isSelected &&
                                "bg-primary text-primary-foreground",
                              !isSelected &&
                                availabilityLevel === "good" &&
                                "border-emerald-300/70 bg-emerald-100/45 hover:bg-emerald-100/65 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
                              !isSelected &&
                                availabilityLevel === "low" &&
                                "border-amber-300/70 bg-amber-100/45 hover:bg-amber-100/65 dark:border-amber-500/40 dark:bg-amber-500/15 dark:hover:bg-amber-500/20",
                              !isSelected &&
                                availabilityLevel === "none" &&
                                !day.isPast &&
                                "hover:bg-muted",
                            )}
                          >
                            {day.date.day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Slots */}
                  <div>
                    <h3 className="font-medium mb-4">
                      {selectedDate
                        ? selectedDate.toLocaleString({
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : "Select a date"}
                    </h3>
                    {!selectedDate ? (
                      <div className="text-sm text-muted-foreground">
                        Choose a date to see available times
                      </div>
                    ) : slotsLoading ? (
                      <div className="text-sm text-muted-foreground">
                        Loading times...
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          No available times on this date
                        </p>
                        {selectedCalendarId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openCalendarAvailability(selectedCalendarId)
                            }
                          >
                            Manage availability
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {availableSlots.map((slot) => (
                          <Button
                            key={slot.start}
                            variant={
                              selectedTime === slot.start
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => setSelectedTime(slot.start)}
                            className="justify-start"
                          >
                            <Icon icon={Clock01Icon} data-icon="inline-start" />
                            {formatTime(slot.start)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Client Search (optional) */}
              <div className="mb-6">
                <Label>Client (optional)</Label>
                <div className="mt-2 space-y-2">
                  <Input
                    placeholder="Search by name or email..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  {clients.length > 0 && (
                    <div className="rounded-md border border-border divide-y divide-border/50">
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setClientSearch(
                              `${client.firstName} ${client.lastName}`,
                            );
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                            selectedClientId === client.id && "bg-muted",
                          )}
                        >
                          <div className="font-medium">
                            {client.firstName} {client.lastName}
                          </div>
                          {client.email && (
                            <div className="text-xs text-muted-foreground">
                              {client.email}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedClientId && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setSelectedClientId("");
                        setClientSearch("");
                      }}
                      className="text-muted-foreground"
                    >
                      Clear selection
                    </Button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Add any notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2"
                  rows={2}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-5 text-sm text-muted-foreground">
                  {selectedTime && (
                    <span className="flex items-center gap-2">
                      <Icon icon={Calendar03Icon} />
                      {formatSelectedDateTime()} ({timezoneShortLabel})
                    </span>
                  )}
                </div>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canBook || createMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createMutation.isPending
                      ? "Booking..."
                      : "Book Appointment"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <AvailabilityManageModal
        open={availabilityModalOpen && open && !!selectedCalendarId}
        onOpenChange={(nextOpen) => {
          setAvailabilityModalOpen(nextOpen);
          if (!nextOpen) {
            void refetchSlots();
          }
        }}
        calendarId={selectedCalendarId}
        calendarName={selectedCalendar?.name ?? defaultCalendarName}
        timezone={schedulingTimezone}
        initialTab="weekly"
      />
    </>
  );
}
