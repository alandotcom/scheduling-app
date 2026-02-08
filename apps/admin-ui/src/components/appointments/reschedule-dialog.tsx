// Reschedule appointment dialog with calendar and time slot picker

import { useState, useMemo } from "react";
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
  isSchedulingTimezoneMode,
  resolveEffectiveSchedulingTimezone,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Reset to current month when opening
      setViewMonth(DateTime.now().startOf("month"));
    }
    if (!isOpen) {
      setSelectedDate(null);
      setSelectedTime(null);
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

  // Format date string using Luxon to avoid timezone issues
  const selectedDateStr = selectedDate ? formatDateISO(selectedDate) : "";

  // Available time slots query
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: appointment.appointmentTypeId,
        calendarIds: [appointment.calendarId],
        startDate: selectedDateStr ?? "",
        endDate: selectedDateStr ?? "",
        timezone: effectiveTimezone,
      },
    }),
    enabled: !!selectedDateStr && open,
  });

  const availableSlots = slotsData?.slots.filter((s) => s.available) ?? [];

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

  return (
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
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-background shadow-xl",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:zoom-out-95 data-open:zoom-in-95",
            "duration-200",
            "max-h-[90vh] overflow-hidden flex flex-col",
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
                <Icon icon={Calendar03Icon} className="text-muted-foreground" />
                <span className="font-medium">
                  {formatDateWithWeekday(
                    appointment.startAt,
                    effectiveTimezone,
                  )}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>
                  {formatTimeDisplay(appointment.startAt, effectiveTimezone)} -{" "}
                  {formatTimeDisplay(appointment.endAt, effectiveTimezone)} (
                  {timezoneShortLabel})
                </span>
              </div>
            </div>

            <div className="mb-6 flex items-end justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Time Display</label>
                <Select
                  value={timezoneMode}
                  onValueChange={(value) => {
                    if (!value || !isSchedulingTimezoneMode(value)) return;
                    if (onTimezoneModeChange) {
                      onTimezoneModeChange(value);
                      return;
                    }
                    setLocalTimezoneMode(value);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar">Calendar time</SelectItem>
                    <SelectItem value="viewer">My time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p
                className="text-sm text-muted-foreground"
                title={effectiveTimezone}
              >
                Showing {timezoneMode === "viewer" ? "your local" : "calendar"}{" "}
                time ({timezoneShortLabel})
              </p>
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
                    const isSelected =
                      selectedDate && day.date.hasSame(selectedDate, "day");
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={day.isPast || !day.isCurrentMonth}
                        onClick={() => {
                          setSelectedDate(day.date);
                          setSelectedTime(null);
                        }}
                        className={cn(
                          "p-2 text-sm rounded-md transition-colors",
                          day.isCurrentMonth
                            ? "text-foreground"
                            : "text-muted-foreground/50",
                          day.isPast && "opacity-50 cursor-not-allowed",
                          day.isToday && "ring-1 ring-primary",
                          isSelected && "bg-primary text-primary-foreground",
                          !isSelected &&
                            !day.isPast &&
                            day.isCurrentMonth &&
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
                  <div className="text-sm text-muted-foreground">
                    No available times on this date
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
              {rescheduleMutation.isPending ? "Rescheduling..." : "Reschedule"}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
