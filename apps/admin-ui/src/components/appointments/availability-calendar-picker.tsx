// Shared calendar + time slot picker used by AppointmentModal and RescheduleDialog

import { useMemo } from "react";
import { DateTime } from "luxon";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import {
  formatDateISO,
  formatTimeDisplay,
  getMonthDays,
} from "@/lib/date-utils";
import {
  type AvailabilitySlotLike,
  buildDayAvailabilityMap,
  filterAvailableSlotsForDate,
  getDayAvailabilityLevel,
  isPastDateForTimezone,
  isTodayForTimezone,
} from "@/components/appointments/day-availability";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface AvailabilityCalendarPickerProps {
  viewMonth: DateTime;
  onViewMonthChange: (month: DateTime) => void;
  selectedDate: DateTime | null;
  onSelectDate: (date: DateTime) => void;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  monthSlots: AvailabilitySlotLike[];
  slotsLoading: boolean;
  schedulingTimezone: string;
  displayTimezone: string;
  onManageAvailability?: () => void;
}

export function AvailabilityCalendarPicker({
  viewMonth,
  onViewMonthChange,
  selectedDate,
  onSelectDate,
  selectedTime,
  onSelectTime,
  monthSlots,
  slotsLoading,
  schedulingTimezone,
  displayTimezone,
  onManageAvailability,
}: AvailabilityCalendarPickerProps) {
  const dayAvailabilityCounts = useMemo(
    () => buildDayAvailabilityMap(monthSlots, schedulingTimezone),
    [monthSlots, schedulingTimezone],
  );

  const selectedDateStr = selectedDate ? formatDateISO(selectedDate) : "";

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

  const calendarDays = useMemo(() => {
    const year = viewMonth.year;
    const month = viewMonth.month - 1;
    const days = getMonthDays(year, month);

    return days.map((date) => ({
      date,
      isCurrentMonth: date.month === month + 1,
      isToday: isTodayForTimezone(formatDateISO(date), schedulingTimezone),
      isPast: isPastDateForTimezone(formatDateISO(date), schedulingTimezone),
    }));
  }, [schedulingTimezone, viewMonth]);

  return (
    <div className="grid grid-cols-1 gap-5 pb-16 sm:grid-cols-2 sm:gap-6 sm:pb-0">
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
              onClick={() => onViewMonthChange(viewMonth.minus({ months: 1 }))}
            >
              <Icon icon={ArrowLeft02Icon} className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onViewMonthChange(viewMonth.plus({ months: 1 }))}
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
          {calendarDays.map((day) => {
            const dayDateKey = formatDateISO(day.date);

            if (!day.isCurrentMonth) {
              return (
                <div
                  key={`${dayDateKey}-empty`}
                  className="p-2"
                  aria-hidden="true"
                  data-slot="calendar-empty-day"
                />
              );
            }

            const isSelected =
              selectedDate && day.date.hasSame(selectedDate, "day");
            const availabilityLevel = day.isPast
              ? "none"
              : getDayAvailabilityLevel(
                  dayAvailabilityCounts.get(dayDateKey) ?? 0,
                );
            return (
              <button
                key={dayDateKey}
                type="button"
                data-availability={availabilityLevel}
                disabled={day.isPast}
                onClick={() => onSelectDate(day.date)}
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
          <div className="text-sm text-muted-foreground">Loading times...</div>
        ) : availableSlots.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No available times on this date
            </p>
            {onManageAvailability ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onManageAvailability}
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
                variant={selectedTime === slot.start ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectTime(slot.start)}
                className="justify-start"
              >
                <Icon icon={Clock01Icon} data-icon="inline-start" />
                {formatTimeDisplay(slot.start, displayTimezone)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
