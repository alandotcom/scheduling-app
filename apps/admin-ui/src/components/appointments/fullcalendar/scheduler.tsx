import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForwardedRef } from "react";
import { DateTime } from "luxon";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import type {
  CalendarApi,
  DateClickData,
  DatesSetData,
  EventDisplayData,
  EventDropData,
} from "@fullcalendar/react";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Loading03Icon,
  TimeScheduleIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { useDrag } from "@use-gesture/react";
import type { AvailabilityFeedItem } from "@scheduling/dto";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import type { ScheduleAppointment } from "@/hooks/use-schedule-appointments";
import { STATUS_DOT_CLASS } from "@/lib/appointment-status";
import { cn } from "@/lib/utils";
import {
  isCalendarAppointmentEventMeta,
  toAppointmentEvents,
  toAvailabilityBackgroundEvents,
  type CalendarAppointmentEventMeta,
} from "./adapter";

const MODIFIABLE_STATUSES = new Set(["scheduled", "confirmed"]);

const VIEW_OPTIONS = [
  { type: "dayGridMonth", label: "Month", short: "M" },
  { type: "timeGridWeek", label: "Week", short: "W" },
  { type: "timeGridDay", label: "Day", short: "D" },
] as const;

const NARROW_BREAKPOINT = 768;

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth < NARROW_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
    const onChange = () => setIsNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isNarrow;
}

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
  changeView: (type: string) => void;
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
  calendarColorById: Map<string, string>;
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
  onRequestRescheduleDialog?: (appointmentId: string) => void;
}

interface AppointmentCalendarRefApi {
  getApi: () => CalendarApi;
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
    calendarColorById,
    onRangeChange,
    onSelectAppointment,
    onCreateFromSlot,
    onRequestConfirm,
    onRequestCancel,
    onRequestNoShow,
    onRequestReschedule,
    onRequestRescheduleDialog,
  }: AppointmentCalendarSchedulerProps,
  ref: ForwardedRef<AppointmentCalendarSchedulerRef>,
) {
  const calendarRef = useRef<AppointmentCalendarRefApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isNarrow = useIsNarrow();
  const [userExplicitView, setUserExplicitView] = useState<string | null>(null);
  const [viewType, setViewType] = useState(
    isNarrow ? "timeGridDay" : "timeGridWeek",
  );
  const [viewTitle, setViewTitle] = useState("");
  const [viewTransitioning, setViewTransitioning] = useState(false);

  // Auto-switch view based on viewport width
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    if (
      isNarrow &&
      viewType === "timeGridWeek" &&
      userExplicitView !== "timeGridWeek"
    ) {
      api.changeView("timeGridDay");
    } else if (
      !isNarrow &&
      viewType === "timeGridDay" &&
      userExplicitView !== "timeGridDay"
    ) {
      api.changeView("timeGridWeek");
    }
  }, [isNarrow, viewType, userExplicitView]);

  const events = useMemo(
    () =>
      viewType === "dayGridMonth"
        ? toAppointmentEvents(appointments, selectedId, calendarColorById)
        : [
            ...toAvailabilityBackgroundEvents(availabilityItems),
            ...toAppointmentEvents(appointments, selectedId, calendarColorById),
          ],
    [appointments, availabilityItems, calendarColorById, selectedId, viewType],
  );

  const initialScrollTime = useMemo(() => {
    const now = DateTime.now().setZone(displayTimezone);
    if (!initialDate.hasSame(now, "day")) return "07:00:00";
    const shifted = now.minus({ minutes: 30 });
    const seconds = Math.max(0, shifted.hour * 3600 + shifted.minute * 60);
    return toTimeString(Math.min(seconds, 23 * 3600));
  }, [displayTimezone, initialDate]);

  useImperativeHandle(
    ref,
    () => ({
      goToPrevious: () => calendarRef.current?.getApi().prev(),
      goToNext: () => calendarRef.current?.getApi().next(),
      goToToday: () => calendarRef.current?.getApi().today(),
      changeView: (type: string) =>
        calendarRef.current?.getApi().changeView(type),
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
        if (onRequestRescheduleDialog) {
          items.push({
            label: "Reschedule",
            icon: TimeScheduleIcon,
            onClick: () => onRequestRescheduleDialog(meta.appointmentId),
          });
        }

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
      onRequestRescheduleDialog,
      onSelectAppointment,
    ],
  );

  const renderEventContent = useCallback(
    (contentArg: EventDisplayData) => {
      if (contentArg.event.display === "background") {
        return null;
      }

      const meta = contentArg.event.extendedProps;
      if (!isCalendarAppointmentEventMeta(meta)) {
        return <span className="text-xs">{contentArg.event.title}</span>;
      }

      const timeRange = contentArg.timeText;
      const isMonthView = contentArg.view.type === "dayGridMonth";
      const calendarColor = meta.calendarColor;
      const isCancelledOrNoShow =
        meta.status === "cancelled" || meta.status === "no_show";
      const statusDotClass =
        STATUS_DOT_CLASS[meta.status as keyof typeof STATUS_DOT_CLASS];

      if (isMonthView) {
        return (
          <ContextMenu items={getContextMenuItems(meta)}>
            <button
              type="button"
              onClick={() => {
                dismissMorePopovers();
                onSelectAppointment(meta.appointmentId);
              }}
              className={cn(
                "calendar-event-chip w-full cursor-pointer rounded-sm px-1.5 py-0.5 text-left",
                isCancelledOrNoShow && "opacity-50",
              )}
              style={{
                backgroundColor: `color-mix(in oklab, ${calendarColor} 15%, var(--color-card))`,
              }}
            >
              <span className="flex items-center gap-1 truncate">
                {statusDotClass ? (
                  <span
                    className={cn(
                      "inline-block size-1.5 shrink-0 rounded-full",
                      statusDotClass,
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "truncate",
                    meta.status === "cancelled" && "line-through",
                  )}
                >
                  {timeRange ? `${timeRange} ` : ""}
                  {meta.clientName}
                </span>
              </span>
            </button>
          </ContextMenu>
        );
      }

      return (
        <ContextMenu items={getContextMenuItems(meta)}>
          <button
            type="button"
            onClick={() => {
              dismissMorePopovers();
              onSelectAppointment(meta.appointmentId);
            }}
            className={cn(
              "calendar-event-card w-full cursor-pointer rounded-md px-1.5 py-1 text-left",
              isCancelledOrNoShow && "opacity-55",
            )}
            style={{
              backgroundColor: `color-mix(in oklab, ${calendarColor} 12%, var(--color-card))`,
            }}
          >
            <div className="flex items-center gap-1">
              {statusDotClass ? (
                <span
                  className={cn(
                    "inline-block size-1.5 shrink-0 rounded-full",
                    statusDotClass,
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "event-title truncate",
                  meta.status === "cancelled" && "line-through",
                )}
              >
                {meta.clientName}
              </div>
            </div>
            {meta.appointmentTypeName ? (
              <div className="event-subtitle truncate">
                {meta.appointmentTypeName}
              </div>
            ) : null}
            {timeRange ? (
              <div className="event-time truncate">{timeRange}</div>
            ) : null}
          </button>
        </ContextMenu>
      );
    },
    [dismissMorePopovers, getContextMenuItems, onSelectAppointment],
  );

  const handleDateClick = useCallback(
    (arg: DateClickData) => {
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
    (arg: EventDropData) => {
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
    (arg: DatesSetData) => {
      if (arg.view.type !== viewType) {
        setViewTransitioning(true);
        requestAnimationFrame(() => setViewTransitioning(false));
      }
      setViewType(arg.view.type);
      setViewTitle(arg.view.title);
      onRangeChange({
        rangeStart: DateTime.fromJSDate(arg.start, { zone: displayTimezone }),
        rangeEnd: DateTime.fromJSDate(arg.end, { zone: displayTimezone }),
        activeDate: DateTime.fromJSDate(arg.view.calendar.getDate(), {
          zone: displayTimezone,
        }),
      });
    },
    [displayTimezone, onRangeChange, viewType],
  );

  const handleChangeView = useCallback((type: string) => {
    setUserExplicitView(type);
    calendarRef.current?.getApi().changeView(type);
  }, []);

  // Swipe navigation (day view only, touch devices)
  useDrag(
    ({ swipe: [swipeX], tap }) => {
      if (tap) return;
      if (swipeX === -1) calendarRef.current?.getApi().next();
      if (swipeX === 1) calendarRef.current?.getApi().prev();
    },
    {
      target: containerRef,
      axis: "x",
      swipe: { distance: 50, velocity: 0.3 },
      filterTaps: true,
      enabled: viewType === "timeGridDay",
      pointer: { touch: true },
    },
  );

  // Filter view options for narrow screens (hide Month)
  const visibleViewOptions = isNarrow
    ? VIEW_OPTIONS.filter((o) => o.type !== "dayGridMonth")
    : VIEW_OPTIONS;

  return (
    <div
      ref={containerRef}
      className={cn(
        "appointment-fullcalendar relative h-full touch-pan-y transition-opacity duration-150",
        viewTransitioning && "opacity-0",
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
        <Icon
          icon={Loading03Icon}
          className="size-5 animate-spin text-muted-foreground"
        />
      </div>

      {/* Custom toolbar */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5 sm:px-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9 md:size-8"
            onClick={() => calendarRef.current?.getApi().prev()}
            aria-label="Previous"
          >
            <Icon icon={ArrowLeft02Icon} className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9 md:size-8"
            onClick={() => calendarRef.current?.getApi().next()}
            aria-label="Next"
          >
            <Icon icon={ArrowRight02Icon} className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-1 h-9 px-3 text-sm md:h-7 md:px-2 md:text-xs"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            Today
          </Button>
        </div>

        <span className="text-base font-semibold md:text-sm">{viewTitle}</span>

        <div
          className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5"
          role="tablist"
          aria-label="Calendar view"
        >
          {visibleViewOptions.map((opt) => (
            <button
              key={opt.type}
              type="button"
              role="tab"
              aria-selected={viewType === opt.type}
              onClick={() => handleChangeView(opt.type)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors md:px-2 md:py-1 md:text-xs",
                viewType === opt.type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{opt.label}</span>
              <span className="sm:hidden">{opt.short}</span>
            </button>
          ))}
        </div>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          classicThemePlugin,
        ]}
        initialView={isNarrow ? "timeGridDay" : "timeGridWeek"}
        initialDate={initialDate.toJSDate()}
        height="100%"
        timeZone={displayTimezone}
        headerToolbar={false}
        editable
        selectable
        dayMaxEvents
        nowIndicator
        scrollTimeReset={false}
        scrollTime={initialScrollTime}
        dragScroll
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        slotDuration="00:15:00"
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
