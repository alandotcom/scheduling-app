// Reschedule appointment dialog with calendar and time slot picker

import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { DateTime } from "luxon";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Cancel01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";

import { orpc } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  formatDateISO,
  formatDateWithWeekday,
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
import {
  buildDayAvailabilityMap,
  filterAvailableSlotsForDate,
  getDayAvailabilityLevel,
} from "@/components/appointments/day-availability";
import { AvailabilityManageModal } from "@/components/availability/availability-manage-modal";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface RescheduleDialogProps {
  appointment: AppointmentWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezoneMode?: SchedulingTimezoneMode;
  onTimezoneModeChange?: (mode: SchedulingTimezoneMode) => void;
  displayTimezone?: string;
  defaultTimezone?: string;
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  timezoneMode: controlledTimezoneMode,
  onTimezoneModeChange,
  displayTimezone,
  defaultTimezone,
}: RescheduleDialogProps) {
  const queryClient = useQueryClient();
  const viewerTimezone = getUserTimezone();
  const [localTimezoneMode, setLocalTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);
  const [selectedDate, setSelectedDate] = useState<DateTime | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() =>
    DateTime.now().startOf("month"),
  );
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const timezoneMode = controlledTimezoneMode ?? localTimezoneMode;
  const selectedDisplayTimezone = displayTimezone ?? defaultTimezone;
  const calendarTimezone =
    appointment.calendar?.timezone ?? appointment.timezone;
  const effectiveTimezone = resolveEffectiveSchedulingTimezone({
    mode: timezoneMode,
    calendarTimezone,
    selectedTimezone: selectedDisplayTimezone,
    fallbackTimezone: defaultTimezone,
    viewerTimezone,
  });
  const timezoneShortLabel = formatTimezoneShort(
    effectiveTimezone,
    selectedTime ?? undefined,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedTime(null);
  }, [open, timezoneMode]);

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Reset to current month when opening
      setViewMonth(DateTime.now().startOf("month"));
    }
    if (!isOpen) {
      setSelectedDate(null);
      setSelectedTime(null);
      setAvailabilityModalOpen(false);
    }
    onOpenChange(isOpen);
  };

  // Reschedule mutation
  const rescheduleMutation = useMutation(
    orpc.appointments.reschedule.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.audit.key() });
        handleOpenChange(false);
        toast.success("Appointment rescheduled");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to reschedule appointment");
      },
    }),
  );

  // Format date strings using Luxon to avoid timezone issues
  const monthStartDateStr = viewMonth.startOf("month").toISODate() ?? "";
  const monthEndDateStr = viewMonth.endOf("month").toISODate() ?? "";
  const selectedDateStr = selectedDate ? formatDateISO(selectedDate) : "";

  // Available time slots query for visible month
  const {
    data: slotsData,
    isLoading: slotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: appointment.appointmentTypeId,
        calendarIds: [appointment.calendarId],
        startDate: monthStartDateStr,
        endDate: monthEndDateStr,
        timezone: calendarTimezone,
      },
    }),
    enabled: open && !!monthStartDateStr && !!monthEndDateStr,
  });

  const monthSlots = slotsData?.slots ?? [];
  const dayAvailabilityCounts = useMemo(
    () => buildDayAvailabilityMap(monthSlots, calendarTimezone),
    [monthSlots, calendarTimezone],
  );
  const availableSlots = useMemo(
    () =>
      selectedDateStr
        ? filterAvailableSlotsForDate(
            monthSlots,
            selectedDateStr,
            calendarTimezone,
          )
        : [],
    [monthSlots, selectedDateStr, calendarTimezone],
  );

  // Calendar days using shared utility
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

  const openCalendarAvailability = () => {
    setAvailabilityModalOpen(true);
  };

  useEffect(() => {
    if (!open || !selectedDate || !selectedTime || slotsLoading) return;

    const stillAvailable = availableSlots.some((slot) => {
      return slot.start === selectedTime;
    });
    if (!stillAvailable) {
      setSelectedTime(null);
    }
  }, [availableSlots, open, selectedDate, selectedTime, slotsLoading]);

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-150",
            )}
          />
          <DialogPrimitive.Popup
            data-slot="reschedule-dialog-content"
            className={cn(
              "fixed left-1/2 top-2 z-50 w-[calc(100vw-1rem)] max-w-2xl -translate-x-1/2 sm:top-8 sm:w-full",
              "rounded-xl border border-border bg-background shadow-xl",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "data-closed:zoom-out-95 data-open:zoom-in-95",
              "duration-200",
              "max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col sm:h-[min(86dvh,52rem)] sm:max-h-[calc(100dvh-4rem)] sm:min-h-[36rem]",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <DialogPrimitive.Title className="text-lg font-medium">
                Reschedule Appointment
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Close</span>
                <Icon icon={Cancel01Icon} />
              </DialogPrimitive.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Current Time */}
              <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Current Time
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Icon
                    icon={Calendar03Icon}
                    className="text-muted-foreground"
                  />
                  <span className="font-medium">
                    {formatDateWithWeekday(
                      appointment.startAt,
                      effectiveTimezone,
                    )}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    {formatTimeDisplay(appointment.startAt, effectiveTimezone)}{" "}
                    - {formatTimeDisplay(appointment.endAt, effectiveTimezone)}{" "}
                    ({timezoneShortLabel})
                  </span>
                </div>
              </div>

              <div className="mb-6 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Time Display</label>
                  <TimeDisplayToggle
                    value={timezoneMode}
                    onValueChange={(value) => {
                      if (onTimezoneModeChange) {
                        onTimezoneModeChange(value);
                        return;
                      }
                      setLocalTimezoneMode(value);
                    }}
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
              <div className="grid grid-cols-2 gap-6">
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
                          onClick={() => {
                            setSelectedDate(day.date);
                            setSelectedTime(null);
                          }}
                          className={cn(
                            "p-2 text-sm rounded-md border border-transparent transition-colors",
                            "text-foreground",
                            day.isPast && "opacity-50 cursor-not-allowed",
                            day.isToday && "ring-1 ring-primary",
                            isSelected && "bg-primary text-primary-foreground",
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openCalendarAvailability}
                      >
                        Manage availability
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {availableSlots.map((slot) => (
                        <Button
                          key={slot.start}
                          variant={
                            selectedTime === slot.start ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setSelectedTime(slot.start)}
                          className="justify-start"
                        >
                          <Icon icon={Clock01Icon} data-icon="inline-start" />
                          {formatTimeDisplay(slot.start, effectiveTimezone)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedTime) {
                    rescheduleMutation.mutate({
                      id: appointment.id,
                      data: {
                        newStartTime: DateTime.fromISO(selectedTime, {
                          setZone: true,
                        }).toJSDate(),
                        timezone: calendarTimezone,
                      },
                    });
                  }
                }}
                disabled={!selectedTime || rescheduleMutation.isPending}
              >
                {rescheduleMutation.isPending
                  ? "Rescheduling..."
                  : "Reschedule"}
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <AvailabilityManageModal
        open={availabilityModalOpen && open}
        onOpenChange={(nextOpen) => {
          setAvailabilityModalOpen(nextOpen);
          if (!nextOpen) {
            void refetchSlots();
          }
        }}
        calendarId={appointment.calendarId}
        calendarName={appointment.calendar?.name}
        timezone={calendarTimezone}
        initialTab="weekly"
      />
    </>
  );
}
