import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";
import type { AvailabilityCalendarPreviewQuery } from "@scheduling/dto";

import { orpc } from "@/lib/query";
import {
  formatDateISO,
  formatDisplayDate,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type {
  AvailabilityPreviewDraftState,
  AvailabilitySubTabType,
} from "./constants";

type PreviewDraftInput = NonNullable<AvailabilityCalendarPreviewQuery["draft"]>;

const TAB_HELP_TEXT: Record<
  Exclude<AvailabilitySubTabType, "overrides">,
  string
> = {
  weekly: "Preview includes unsaved weekly-hours changes.",
  blocked: "Preview includes unsaved blocked-time changes.",
  limits: "Preview includes unsaved scheduling-limit changes.",
};

interface AvailabilityPreviewPanelProps {
  calendarId: string;
  timezone: string;
  activeTab: Exclude<AvailabilitySubTabType, "overrides">;
  draft: AvailabilityPreviewDraftState;
}

type DayWindow = {
  startMinute: number;
  endMinute: number;
};

type DayTimeline = {
  date: DateTime;
  dateKey: string;
  slotCount: number;
  windows: DayWindow[];
};

type TimelineScale = {
  startMinute: number;
  endMinute: number;
  spanMinutes: number;
  gridTicks: number[];
  headerTicks: number[];
};

const FULL_DAY_START_MINUTE = 0;
const FULL_DAY_END_MINUTE = 24 * 60;
const TIMELINE_PADDING_MINUTES = 60;
const MIN_TIMELINE_SPAN_MINUTES = 6 * 60;

function minutesFromDayStart(dt: DateTime): number {
  return Math.max(
    0,
    Math.min(
      24 * 60,
      Math.round(dt.diff(dt.startOf("day"), "minutes").minutes),
    ),
  );
}

function mergeWindows(
  windows: Array<{ startMinute: number; endMinute: number }>,
): DayWindow[] {
  if (windows.length === 0) return [];

  const sorted = windows.toSorted((a, b) => a.startMinute - b.startMinute);
  const merged: DayWindow[] = [];

  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      });
      continue;
    }

    if (window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
      continue;
    }

    merged.push({
      startMinute: window.startMinute,
      endMinute: window.endMinute,
    });
  }

  return merged;
}

function formatMinuteLabel(minute: number, timezone: string): string {
  const normalizedMinute =
    ((minute % FULL_DAY_END_MINUTE) + FULL_DAY_END_MINUTE) %
    FULL_DAY_END_MINUTE;
  const hour = Math.floor(normalizedMinute / 60);
  const minuteValue = normalizedMinute % 60;
  return DateTime.fromObject(
    { hour, minute: minuteValue },
    { zone: timezone },
  ).toFormat("h:mm a");
}

function formatTickLabel(minute: number, timezone: string): string {
  return formatMinuteLabel(minute, timezone).replace(":00", "");
}

function buildTicks(
  startMinute: number,
  endMinute: number,
  stepMinutes: number,
) {
  const ticks = [startMinute];
  const firstAlignedTick = Math.ceil(startMinute / stepMinutes) * stepMinutes;

  for (let tick = firstAlignedTick; tick < endMinute; tick += stepMinutes) {
    if (tick > startMinute) ticks.push(tick);
  }

  if (ticks[ticks.length - 1] !== endMinute) {
    ticks.push(endMinute);
  }

  return ticks;
}

function roundToNearestHour(minute: number): number {
  return Math.round(minute / 60) * 60;
}

function buildHeaderTicks(startMinute: number, endMinute: number): number[] {
  const spanMinutes = endMinute - startMinute;
  if (spanMinutes <= 0) return [startMinute];

  const minEdgeGapMinutes = 2 * 60;
  const midpointMinute = roundToNearestHour((startMinute + endMinute) / 2);
  const hasUsableMidpoint =
    midpointMinute - startMinute >= minEdgeGapMinutes &&
    endMinute - midpointMinute >= minEdgeGapMinutes;

  if (!hasUsableMidpoint) {
    return [startMinute, endMinute];
  }

  return [startMinute, midpointMinute, endMinute];
}

function buildTimelineScale(dayTimelines: DayTimeline[]): TimelineScale {
  const allWindows = dayTimelines.flatMap((day) => day.windows);
  if (allWindows.length === 0) {
    return {
      startMinute: FULL_DAY_START_MINUTE,
      endMinute: FULL_DAY_END_MINUTE,
      spanMinutes: FULL_DAY_END_MINUTE,
      gridTicks: [0, 6, 12, 18, 24].map((hour) => hour * 60),
      headerTicks: [0, 12, 24].map((hour) => hour * 60),
    };
  }

  const minStartMinute = Math.min(
    ...allWindows.map((window) => window.startMinute),
  );
  const maxEndMinute = Math.max(
    ...allWindows.map((window) => window.endMinute),
  );
  let startMinute = Math.max(
    FULL_DAY_START_MINUTE,
    Math.floor((minStartMinute - TIMELINE_PADDING_MINUTES) / 60) * 60,
  );
  let endMinute = Math.min(
    FULL_DAY_END_MINUTE,
    Math.ceil((maxEndMinute + TIMELINE_PADDING_MINUTES) / 60) * 60,
  );

  if (endMinute - startMinute < MIN_TIMELINE_SPAN_MINUTES) {
    const midpoint = Math.round((startMinute + endMinute) / 2);
    startMinute = Math.max(
      FULL_DAY_START_MINUTE,
      Math.floor((midpoint - MIN_TIMELINE_SPAN_MINUTES / 2) / 60) * 60,
    );
    endMinute = Math.min(
      FULL_DAY_END_MINUTE,
      startMinute + MIN_TIMELINE_SPAN_MINUTES,
    );

    if (endMinute - startMinute < MIN_TIMELINE_SPAN_MINUTES) {
      startMinute = Math.max(
        FULL_DAY_START_MINUTE,
        endMinute - MIN_TIMELINE_SPAN_MINUTES,
      );
    }
  }

  const spanMinutes = Math.max(1, endMinute - startMinute);
  const gridStepMinutes =
    spanMinutes <= 8 * 60 ? 60 : spanMinutes <= 14 * 60 ? 120 : 180;

  return {
    startMinute,
    endMinute,
    spanMinutes,
    gridTicks: buildTicks(startMinute, endMinute, gridStepMinutes),
    headerTicks: buildHeaderTicks(startMinute, endMinute),
  };
}

function buildDayTimelines(
  weekDays: DateTime[],
  timezone: string,
  slots: Array<{ start: string; end: string; available: boolean }>,
): DayTimeline[] {
  const byDate = new Map<
    string,
    Array<{ startMinute: number; endMinute: number }>
  >();
  const counts = new Map<string, number>();

  for (const slot of slots) {
    if (!slot.available) continue;
    const start = DateTime.fromISO(slot.start, { setZone: true }).setZone(
      timezone,
    );
    const end = DateTime.fromISO(slot.end, { setZone: true }).setZone(timezone);
    if (!start.isValid || !end.isValid) continue;

    const dateKey = start.toISODate();
    if (!dateKey) continue;

    const list = byDate.get(dateKey) ?? [];
    list.push({
      startMinute: minutesFromDayStart(start),
      endMinute: minutesFromDayStart(end),
    });
    byDate.set(dateKey, list);
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return weekDays.map((date) => {
    const dateKey = formatDateISO(date);
    return {
      date,
      dateKey,
      slotCount: counts.get(dateKey) ?? 0,
      windows: mergeWindows(byDate.get(dateKey) ?? []),
    };
  });
}

export function AvailabilityPreviewPanel({
  calendarId,
  timezone,
  activeTab,
  draft,
}: AvailabilityPreviewPanelProps) {
  const [viewWeekStart, setViewWeekStart] = useState(() =>
    DateTime.now().setZone(timezone).startOf("week"),
  );

  const previewDraft = useMemo<PreviewDraftInput | undefined>(() => {
    const next: PreviewDraftInput = {};

    if (draft.weeklyRules) {
      next.weeklyRules = draft.weeklyRules;
    }
    if (draft.blockedTime) {
      next.blockedTime = draft.blockedTime.map((entry) => ({
        startAt: entry.startAt,
        endAt: entry.endAt,
        recurringRule: entry.recurringRule ?? undefined,
      }));
    }
    if (draft.schedulingLimits) {
      next.schedulingLimits = draft.schedulingLimits;
    }

    return Object.keys(next).length > 0 ? next : undefined;
  }, [draft]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        viewWeekStart.plus({ days: index }).startOf("day"),
      ),
    [viewWeekStart],
  );

  const weekStartDate = formatDateISO(weekDays[0] ?? viewWeekStart);
  const weekEndDate = formatDateISO(weekDays[6] ?? viewWeekStart);

  const {
    data: previewSlotsData,
    isLoading: previewLoading,
    error: previewError,
  } = useQuery({
    ...orpc.availability.engine.previewTimes.queryOptions({
      input: {
        calendarId,
        startDate: weekStartDate,
        endDate: weekEndDate,
        timezone,
        ...(previewDraft ? { draft: previewDraft } : {}),
      },
    }),
    enabled: !!calendarId,
    placeholderData: (previous) => previous,
  });

  const dayTimelines = useMemo(
    () => buildDayTimelines(weekDays, timezone, previewSlotsData?.slots ?? []),
    [previewSlotsData?.slots, timezone, weekDays],
  );
  const timelineScale = useMemo(
    () => buildTimelineScale(dayTimelines),
    [dayTimelines],
  );

  const previewErrorMessage =
    previewError instanceof Error
      ? previewError.message
      : "Unable to load availability preview.";

  const rangeLabel = `${formatDisplayDate(weekStartDate, timezone)} - ${formatDisplayDate(weekEndDate, timezone)}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon icon={Calendar03Icon} className="text-muted-foreground" />
          <h3 className="text-sm font-medium">Availability Preview</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {TAB_HELP_TEXT[activeTab]} Calendar timezone:{" "}
          {formatTimezoneShort(timezone)}.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-border p-3">
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">Week of {rangeLabel}</p>
            <p className="text-xs text-muted-foreground">Available windows.</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center rounded-md border border-border/70 bg-muted/35 p-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-10"
                onClick={() =>
                  setViewWeekStart((previous) => previous.minus({ weeks: 1 }))
                }
                aria-label="Previous week"
              >
                <Icon icon={ArrowLeft02Icon} className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-10"
                onClick={() =>
                  setViewWeekStart((previous) => previous.plus({ weeks: 1 }))
                }
                aria-label="Next week"
              >
                <Icon icon={ArrowRight02Icon} className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border p-3">
        <div className="mb-2 grid grid-cols-[5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Day
          </div>
          <div className="relative h-4">
            {timelineScale.headerTicks.map((tick) => (
              <span
                key={tick}
                className={
                  tick === timelineScale.startMinute
                    ? "absolute left-0 text-[11px] text-muted-foreground whitespace-nowrap"
                    : tick === timelineScale.endMinute
                      ? "absolute right-0 text-[11px] text-muted-foreground whitespace-nowrap text-right"
                      : "absolute -translate-x-1/2 text-[11px] text-muted-foreground whitespace-nowrap"
                }
                style={
                  tick === timelineScale.endMinute
                    ? undefined
                    : {
                        left: `${((tick - timelineScale.startMinute) / timelineScale.spanMinutes) * 100}%`,
                      }
                }
              >
                {formatTickLabel(tick, timezone)}
              </span>
            ))}
          </div>
          <div className="text-right text-[11px] font-medium text-muted-foreground">
            Slots
          </div>
        </div>

        {previewLoading && !previewSlotsData ? (
          <p className="text-sm text-muted-foreground">Loading preview...</p>
        ) : previewError && !previewSlotsData ? (
          <p className="text-sm text-destructive">{previewErrorMessage}</p>
        ) : (
          <div className="space-y-1.5">
            {dayTimelines.map((day) => (
              <div
                key={day.dateKey}
                className="grid grid-cols-[5rem_minmax(0,1fr)_3.5rem] items-center gap-2"
              >
                <div className="truncate text-xs text-foreground">
                  {day.date.toFormat("ccc d")}
                </div>
                <div className="relative h-6 rounded-sm bg-muted/45">
                  {timelineScale.gridTicks.slice(1, -1).map((tick) => (
                    <span
                      key={tick}
                      className="absolute inset-y-0 w-px bg-border/70"
                      style={{
                        left: `${((tick - timelineScale.startMinute) / timelineScale.spanMinutes) * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                  ))}
                  {day.windows.map((window, index) => {
                    const clippedStartMinute = Math.max(
                      window.startMinute,
                      timelineScale.startMinute,
                    );
                    const clippedEndMinute = Math.min(
                      window.endMinute,
                      timelineScale.endMinute,
                    );
                    if (clippedEndMinute <= clippedStartMinute) {
                      return null;
                    }
                    const left =
                      ((clippedStartMinute - timelineScale.startMinute) /
                        timelineScale.spanMinutes) *
                      100;
                    const width = Math.max(
                      0.5,
                      ((clippedEndMinute - clippedStartMinute) /
                        timelineScale.spanMinutes) *
                        100,
                    );
                    return (
                      <span
                        key={`${day.dateKey}-${index}`}
                        className="absolute inset-y-1 rounded-sm bg-primary/75"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${formatMinuteLabel(window.startMinute, timezone)} - ${formatMinuteLabel(window.endMinute, timezone)}`}
                      />
                    );
                  })}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {day.slotCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
