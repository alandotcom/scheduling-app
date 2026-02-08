// Schedule grid component for week view

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScheduleEvent } from "./schedule-event";
import type { ScheduleAppointment } from "@/hooks/use-schedule-appointments";
import {
  formatTimezoneShort,
  formatWeekRange,
  getWeekDays,
  isToday,
} from "@/lib/date-utils";

interface ScheduleGridProps {
  appointments: ScheduleAppointment[];
  displayTimezone: string;
  weekStart: DateTime;
  selectedId: string | null;
  onSelectAppointment: (id: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  isLoading?: boolean;
}

// Grid configuration
const START_HOUR = 7; // 7 AM
const END_HOUR = 20; // 8 PM
const HOUR_HEIGHT = 60; // pixels per hour
const TOTAL_HOURS = END_HOUR - START_HOUR;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateHeader(date: DateTime): string {
  return date.toLocaleString({
    month: "short",
    day: "numeric",
  });
}

function getEventPosition(startAt: DateTime, endAt: DateTime) {
  const startHour = startAt.hour + startAt.minute / 60;
  const endHour = endAt.hour + endAt.minute / 60;

  // Clamp to visible range
  const visibleStart = Math.max(startHour, START_HOUR);
  const visibleEnd = Math.min(endHour, END_HOUR);

  const top = (visibleStart - START_HOUR) * HOUR_HEIGHT;
  const height = (visibleEnd - visibleStart) * HOUR_HEIGHT;

  return { top, height };
}

function getAppointmentsByDay(
  appointments: ScheduleAppointment[],
  weekDays: DateTime[],
): Map<number, ScheduleAppointment[]> {
  const byDay = new Map<number, ScheduleAppointment[]>();

  for (let i = 0; i < 7; i++) {
    byDay.set(i, []);
  }

  for (const apt of appointments) {
    const dayIndex = weekDays.findIndex((day) =>
      apt.startAt.hasSame(day, "day"),
    );

    if (dayIndex >= 0) {
      byDay.get(dayIndex)!.push(apt);
    }
  }

  return byDay;
}

export function ScheduleGrid({
  appointments,
  displayTimezone,
  weekStart,
  selectedId,
  onSelectAppointment,
  onPreviousWeek,
  onNextWeek,
  onToday,
  isLoading,
}: ScheduleGridProps) {
  const [viewMode, setViewMode] = useState<"week" | "day">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches
      ? "day"
      : "week",
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, etc.
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0 index
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const handler = (e: MediaQueryListEvent) => {
      setViewMode(e.matches ? "week" : "day");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const timezoneShortLabel = formatTimezoneShort(displayTimezone);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const appointmentsByDay = useMemo(
    () => getAppointmentsByDay(appointments, weekDays),
    [appointments, weekDays],
  );

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  // Safe access: clamp selectedDayIndex and assert non-null (weekDays always has 7 entries)
  const clampedDayIndex = Math.min(selectedDayIndex, weekDays.length - 1);
  const selectedDay = weekDays[clampedDayIndex]!;

  const visibleDays =
    viewMode === "day"
      ? [{ day: selectedDay, index: clampedDayIndex }]
      : weekDays.map((day, index) => ({ day, index }));

  return (
    <div className="relative flex h-full flex-col">
      {/* Header with navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPreviousWeek}>
            <Icon icon={ArrowLeft02Icon} className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onNextWeek}>
            <Icon icon={ArrowRight02Icon} className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            <Icon icon={Calendar03Icon} className="size-4 mr-1" />
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === "day" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDayIndex((i) => (i > 0 ? i - 1 : 6))}
              >
                <Icon icon={ArrowLeft02Icon} className="size-4" />
              </Button>
              <span className="text-sm font-medium min-w-[80px] text-center">
                {WEEKDAYS[selectedDay.weekday % 7]},{" "}
                {formatDateHeader(selectedDay)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDayIndex((i) => (i < 6 ? i + 1 : 0))}
              >
                <Icon icon={ArrowRight02Icon} className="size-4" />
              </Button>
            </div>
          )}
          {viewMode === "week" && (
            <span className="text-sm font-medium">
              {formatWeekRange(weekStart)} ({timezoneShortLabel})
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="sm:hidden"
            onClick={() => setViewMode((m) => (m === "week" ? "day" : "week"))}
          >
            {viewMode === "day" ? "Week" : "Day"}
          </Button>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/35">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className={viewMode === "week" ? "min-w-[800px]" : ""}>
          {/* Day headers */}
          <div className="flex border-b border-border bg-muted/30 sticky top-0 z-10">
            <div className="w-16 shrink-0" />
            {visibleDays.map(({ day }) => (
              <div
                key={day.toISODate() ?? `${day.year}-${day.month}-${day.day}`}
                className={`flex-1 px-2 py-2 text-center border-l border-border/30 ${
                  isToday(day) ? "bg-primary/5" : ""
                }`}
              >
                <div className="text-xs text-muted-foreground">
                  {WEEKDAYS[day.weekday % 7]}
                </div>
                <div
                  className={`text-sm font-medium ${
                    isToday(day) ? "text-primary" : ""
                  }`}
                >
                  {formatDateHeader(day)}
                </div>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative flex">
            {/* Time labels */}
            <div className="w-16 shrink-0">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="relative border-b border-border/20"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="absolute -top-2.5 right-2 text-xs text-muted-foreground">
                    {hour === 12
                      ? "12 PM"
                      : hour > 12
                        ? `${hour - 12} PM`
                        : `${hour} AM`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {visibleDays.map(({ day, index: dayIndex }) => {
              const dayAppointments = appointmentsByDay.get(dayIndex) ?? [];

              return (
                <div
                  key={day.toISODate() ?? `${day.year}-${day.month}-${day.day}`}
                  className={`flex-1 relative border-l border-border/30 ${
                    isToday(day) ? "bg-primary/5" : ""
                  }`}
                >
                  {/* Hour lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-border/20"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Appointments */}
                  {dayAppointments.map((apt) => {
                    const { top, height } = getEventPosition(
                      apt.startAt,
                      apt.endAt,
                    );

                    if (height <= 0) return null;

                    return (
                      <ScheduleEvent
                        key={apt.id}
                        startAt={apt.startAt}
                        endAt={apt.endAt}
                        displayTimezone={displayTimezone}
                        status={apt.status}
                        clientName={apt.clientName}
                        appointmentTypeName={apt.appointmentTypeName}
                        isSelected={apt.id === selectedId}
                        onClick={() => onSelectAppointment(apt.id)}
                        top={top}
                        height={height}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
