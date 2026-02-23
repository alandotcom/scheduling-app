import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { ForwardedRef } from "react";
import { DateTime } from "luxon";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import type { DateClickArg } from "@fullcalendar/interaction";
// FullCalendar v6 emits runtime styles from these internal entrypoints.
import "@fullcalendar/core/internal.js";
import "@fullcalendar/daygrid/internal.js";
import "@fullcalendar/timegrid/internal.js";
import type {
  DatesSetArg,
  EventContentArg,
  EventDropArg,
} from "@fullcalendar/core";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import type { AvailabilityFeedItem } from "@scheduling/dto";

import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import type { ScheduleAppointment } from "@/hooks/use-schedule-appointments";
import { cn } from "@/lib/utils";
import {
  isCalendarAppointmentEventMeta,
  toAppointmentEvents,
  toAvailabilityBackgroundEvents,
  type CalendarAppointmentEventMeta,
} from "./adapter";

const MODIFIABLE_STATUSES = new Set(["scheduled", "confirmed"]);

function getDateFromSelection(
  dateInput: Date,
  allDay: boolean,
  timezone: string,
): Date {
  const selected = DateTime.fromJSDate(dateInput, { zone: timezone });
  if (!allDay) {
    return selected.toJSDate();
  }

  return selected
    .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

function toTimeString(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export interface AppointmentCalendarRange {
  rangeStart: DateTime;
  rangeEnd: DateTime;
  activeDate: DateTime;
}

export interface AppointmentCalendarSchedulerRef {
  goToPrevious: () => void;
  goToNext: () => void;
  goToToday: () => void;
}

interface AppointmentCalendarSchedulerProps {
  appointments: ScheduleAppointment[];
  availabilityItems: AvailabilityFeedItem[];
  selectedId: string | null;
  initialDate: DateTime;
  displayTimezone: string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  calendarTimezoneById: Record<string, string>;
  onRangeChange: (range: AppointmentCalendarRange) => void;
  onSelectAppointment: (id: string) => void;
  onCreateFromSlot: (input: { startAt: Date; endAt: Date }) => void;
  onRequestConfirm: (id: string) => void;
  onRequestCancel: (id: string) => void;
  onRequestNoShow: (id: string) => void;
  onRequestReschedule: (input: {
    appointmentId: string;
    oldStartAt: Date;
    oldEndAt: Date;
    newStartAt: Date;
    newEndAt: Date;
    timezone: string;
  }) => void;
}

function SchedulerInner(
  {
    appointments,
    availabilityItems,
    selectedId,
    initialDate,
    displayTimezone,
    isLoading,
    isRefreshing,
    calendarTimezoneById,
    onRangeChange,
    onSelectAppointment,
    onCreateFromSlot,
    onRequestConfirm,
    onRequestCancel,
    onRequestNoShow,
    onRequestReschedule,
  }: AppointmentCalendarSchedulerProps,
  ref: ForwardedRef<AppointmentCalendarSchedulerRef>,
) {
  const calendarRef = useRef<FullCalendar | null>(null);

  const events = useMemo(
    () => [
      ...toAvailabilityBackgroundEvents(availabilityItems),
      ...toAppointmentEvents(appointments, selectedId),
    ],
    [appointments, availabilityItems, selectedId],
  );
  const slotWindow = useMemo(() => {
    const defaultMinSeconds = 7 * 3600;
    const defaultMaxSeconds = 20 * 3600;
    const now = DateTime.now().setZone(displayTimezone);
    if (!initialDate.hasSame(now, "day")) {
      return {
        minTime: toTimeString(defaultMinSeconds),
        maxTime: toTimeString(defaultMaxSeconds),
      };
    }

    const nowSeconds = now.hour * 3600 + now.minute * 60;
    const roundedMin = Math.max(
      0,
      Math.floor(Math.max(0, nowSeconds - 3600) / 1800) * 1800,
    );
    const roundedMax = Math.min(
      24 * 3600,
      Math.ceil((nowSeconds + 3600) / 1800) * 1800,
    );

    return {
      minTime: toTimeString(Math.min(defaultMinSeconds, roundedMin)),
      maxTime: toTimeString(Math.max(defaultMaxSeconds, roundedMax)),
    };
  }, [displayTimezone, initialDate]);
  const initialScrollTime = useMemo(() => {
    const now = DateTime.now().setZone(displayTimezone);
    if (!initialDate.hasSame(now, "day")) {
      return slotWindow.minTime;
    }

    // Keep the now-indicator visible by scrolling slightly before current time.
    const shifted = now.minus({ minutes: 30 });
    const minSeconds = DateTime.fromISO(
      `1970-01-01T${slotWindow.minTime}`,
    ).diff(DateTime.fromISO("1970-01-01T00:00:00"), "seconds").seconds;
    const maxSeconds = DateTime.fromISO(
      `1970-01-01T${slotWindow.maxTime}`,
    ).diff(DateTime.fromISO("1970-01-01T00:00:00"), "seconds").seconds;
    const clampedSeconds = Math.min(
      Math.max(shifted.hour * 3600 + shifted.minute * 60, minSeconds),
      Math.max(minSeconds, maxSeconds - 3600),
    );
    return toTimeString(clampedSeconds);
  }, [displayTimezone, initialDate, slotWindow.maxTime, slotWindow.minTime]);

  useImperativeHandle(
    ref,
    () => ({
      goToPrevious: () => calendarRef.current?.getApi().prev(),
      goToNext: () => calendarRef.current?.getApi().next(),
      goToToday: () => calendarRef.current?.getApi().today(),
    }),
    [],
  );

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    const activeDate = DateTime.fromJSDate(api.getDate(), {
      zone: displayTimezone,
    });
    if (!activeDate.hasSame(initialDate, "day")) {
      api.gotoDate(initialDate.toJSDate());
    }

    const now = DateTime.now().setZone(displayTimezone);
    if (initialDate.hasSame(now, "day")) {
      api.scrollToTime(initialScrollTime);
    }
  }, [displayTimezone, initialDate, initialScrollTime]);

  const dismissMorePopovers = useCallback(() => {
    const popovers = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".appointment-fullcalendar .fc-popover",
      ),
    );

    for (const popover of popovers) {
      const closeButton =
        popover.querySelector<HTMLElement>(".fc-popover-close");
      if (closeButton) {
        closeButton.click();
      } else {
        popover.remove();
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    dismissMorePopovers();
  }, [dismissMorePopovers, selectedId]);

  const getContextMenuItems = useCallback(
    (meta: CalendarAppointmentEventMeta): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        {
          label: "View Details",
          icon: ViewIcon,
          onClick: () => {
            dismissMorePopovers();
            onSelectAppointment(meta.appointmentId);
          },
        },
      ];

      if (meta.status === "scheduled") {
        items.push({
          label: "Confirm",
          icon: CheckmarkCircle01Icon,
          onClick: () => onRequestConfirm(meta.appointmentId),
        });
      }

      if (MODIFIABLE_STATUSES.has(meta.status)) {
        items.push({
          label: "Mark No-Show",
          icon: Clock01Icon,
          onClick: () => onRequestNoShow(meta.appointmentId),
        });
        items.push({
          label: "Cancel",
          icon: Cancel01Icon,
          onClick: () => onRequestCancel(meta.appointmentId),
          variant: "destructive",
          separator: true,
        });
      }

      return items;
    },
    [
      dismissMorePopovers,
      onRequestCancel,
      onRequestConfirm,
      onRequestNoShow,
      onSelectAppointment,
    ],
  );

  const renderEventContent = useCallback(
    (contentArg: EventContentArg) => {
      if (contentArg.event.display === "background") {
        return null;
      }

      const meta = contentArg.event.extendedProps;
      if (!isCalendarAppointmentEventMeta(meta)) {
        return <span className="text-xs">{contentArg.event.title}</span>;
      }

      const timeRange = contentArg.timeText;

      return (
        <ContextMenu items={getContextMenuItems(meta)}>
          <button
            type="button"
            onClick={() => {
              dismissMorePopovers();
              onSelectAppointment(meta.appointmentId);
            }}
            className="calendar-event-card w-full cursor-pointer rounded-md px-1.5 py-1 text-left"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    meta.calendarColor ?? "var(--color-muted-foreground)",
                }}
              />
              <div className="truncate text-xs font-medium">
                {meta.clientName}
              </div>
            </div>
            {meta.appointmentTypeName ? (
              <div className="truncate text-[10px] opacity-85">
                {meta.appointmentTypeName}
              </div>
            ) : null}
            {timeRange ? (
              <div className="truncate text-[10px] opacity-75">{timeRange}</div>
            ) : null}
          </button>
        </ContextMenu>
      );
    },
    [dismissMorePopovers, getContextMenuItems, onSelectAppointment],
  );

  const handleDateClick = useCallback(
    (arg: DateClickArg) => {
      if (
        !arg.view.type.startsWith("timeGrid") &&
        arg.view.type !== "dayGridMonth"
      ) {
        return;
      }

      const startAt = getDateFromSelection(
        arg.date,
        arg.allDay,
        displayTimezone,
      );
      const endAt = DateTime.fromJSDate(startAt)
        .plus({ minutes: 30 })
        .toJSDate();
      onCreateFromSlot({ startAt, endAt });
    },
    [displayTimezone, onCreateFromSlot],
  );

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      const eventMeta = arg.event.extendedProps;
      if (!isCalendarAppointmentEventMeta(eventMeta)) {
        arg.revert();
        return;
      }

      if (!MODIFIABLE_STATUSES.has(eventMeta.status)) {
        arg.revert();
        return;
      }

      const oldStartAt = arg.oldEvent.start;
      const oldEndAt = arg.oldEvent.end;
      const newStartAt = arg.event.start;
      const newEndAt =
        arg.event.end ??
        (oldEndAt && oldStartAt
          ? DateTime.fromJSDate(newStartAt ?? oldStartAt)
              .plus(
                DateTime.fromJSDate(oldEndAt).diff(
                  DateTime.fromJSDate(oldStartAt),
                ),
              )
              .toJSDate()
          : null);

      if (!(oldStartAt && oldEndAt && newStartAt && newEndAt)) {
        arg.revert();
        return;
      }

      const timezone =
        calendarTimezoneById[eventMeta.calendarId] ?? displayTimezone;

      // Force explicit user confirmation before mutating server state.
      arg.revert();

      onRequestReschedule({
        appointmentId: eventMeta.appointmentId,
        oldStartAt,
        oldEndAt,
        newStartAt,
        newEndAt,
        timezone,
      });
    },
    [calendarTimezoneById, displayTimezone, onRequestReschedule],
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      onRangeChange({
        rangeStart: DateTime.fromJSDate(arg.start, { zone: displayTimezone }),
        rangeEnd: DateTime.fromJSDate(arg.end, { zone: displayTimezone }),
        activeDate: DateTime.fromJSDate(arg.view.calendar.getDate(), {
          zone: displayTimezone,
        }),
      });
    },
    [displayTimezone, onRangeChange],
  );

  return (
    <div
      className={cn(
        "appointment-fullcalendar relative h-full",
        isLoading && "is-loading",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 bg-primary/65 transition-opacity duration-200",
          isRefreshing ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/40 transition-opacity duration-200",
          isLoading ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          luxon3Plugin,
        ]}
        initialView="timeGridWeek"
        initialDate={initialDate.toJSDate()}
        height="100%"
        timeZone={displayTimezone}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        editable
        selectable
        dayMaxEvents
        nowIndicator
        scrollTimeReset={false}
        scrollTime={initialScrollTime}
        dragScroll
        slotMinTime={slotWindow.minTime}
        slotMaxTime={slotWindow.maxTime}
        slotDuration="00:15:00"
        slotLabelInterval="01:00"
        eventOverlap
        allDaySlot={false}
        eventDurationEditable={false}
        events={events}
        eventContent={renderEventContent}
        eventDrop={handleEventDrop}
        dateClick={handleDateClick}
        datesSet={handleDatesSet}
      />
    </div>
  );
}

export const AppointmentCalendarScheduler = forwardRef<
  AppointmentCalendarSchedulerRef,
  AppointmentCalendarSchedulerProps
>(SchedulerInner);
