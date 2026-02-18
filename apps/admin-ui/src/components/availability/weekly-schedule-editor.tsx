// Weekly schedule editor - with free-text time range input per day

import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FloppyDiskIcon,
  Copy01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import {
  WEEKDAYS,
  type TimeBlock,
  type DaySchedule,
  type WeeklySchedule,
} from "./constants";
import {
  parseTimeRanges,
  formatTimeBlocksForInput,
  validateTimeBlocks,
} from "./time-range-parser";

interface WeeklyScheduleEditorProps {
  calendarId: string;
  timezone: string;
}

interface WeeklyScheduleEditorBodyProps extends WeeklyScheduleEditorProps {
  compact: boolean;
}

function createEmptyWeeklySchedule(): WeeklySchedule {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [d.value, { enabled: false, blocks: [] }]),
  ) as WeeklySchedule;
}

function buildWeeklyScheduleFromRules(
  rules:
    | Array<{ weekday: number; startTime: string; endTime: string }>
    | undefined,
): WeeklySchedule {
  const schedule = createEmptyWeeklySchedule();
  if (!rules?.length) {
    return schedule;
  }
  for (const rule of rules) {
    const dayEntry = schedule[rule.weekday] ?? {
      enabled: false,
      blocks: [],
    };
    dayEntry.enabled = true;
    dayEntry.blocks.push({
      startTime: rule.startTime,
      endTime: rule.endTime,
    });
    schedule[rule.weekday] = dayEntry;
  }
  return schedule;
}

export function WeeklyScheduleEditor(props: WeeklyScheduleEditorProps) {
  return <WeeklyScheduleEditorBody {...props} compact={false} />;
}

export function CompactWeeklyScheduleEditor(props: WeeklyScheduleEditorProps) {
  return <WeeklyScheduleEditorBody {...props} compact />;
}

function DayTimeInput({
  day,
  daySchedule,
  onUpdate,
  compact,
}: {
  day: (typeof WEEKDAYS)[number];
  daySchedule: DaySchedule;
  onUpdate: (weekday: number, schedule: DaySchedule) => void;
  compact: boolean;
}) {
  const [draftInputValue, setDraftInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayInputValue =
    daySchedule.enabled && daySchedule.blocks.length > 0
      ? formatTimeBlocksForInput(daySchedule.blocks)
      : "";
  const inputValue = isFocused ? draftInputValue : displayInputValue;
  const error = isFocused ? draftError : null;

  const commitValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();

      if (!trimmed) {
        // Clearing input disables the day
        onUpdate(day.value, { enabled: false, blocks: [] });
        setDraftError(null);
        return;
      }

      const parsed = parseTimeRanges(trimmed);

      if (parsed.length === 0) {
        setDraftError("Could not parse time ranges. Try: 9am-5pm");
        return;
      }

      const validationError = validateTimeBlocks(parsed);
      if (validationError) {
        setDraftError(validationError);
        return;
      }

      setDraftError(null);
      onUpdate(day.value, { enabled: true, blocks: parsed });
    },
    [day.value, onUpdate],
  );

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(draftInputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitValue(draftInputValue);
      inputRef.current?.blur();
    }
  };

  const isActive = daySchedule.enabled && daySchedule.blocks.length > 0;

  return (
    <div className="group flex items-start gap-3">
      <button
        type="button"
        onClick={() => {
          if (isActive) {
            onUpdate(day.value, { enabled: false, blocks: [] });
            setDraftInputValue("");
            setDraftError(null);
          } else {
            const defaultBlocks: TimeBlock[] = [
              { startTime: "09:00", endTime: "17:00" },
            ];
            onUpdate(day.value, { enabled: true, blocks: defaultBlocks });
          }
        }}
        className={`mt-2.5 shrink-0 flex items-center justify-center rounded-md text-xs font-semibold transition-all ${
          compact ? "w-10 h-7" : "w-12 h-8"
        } ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
        aria-label={`Toggle ${day.label}`}
      >
        {compact ? day.short : day.short}
      </button>

      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setDraftInputValue(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            setDraftError(null);
            setDraftInputValue(displayInputValue);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={
            isActive ? "9am-5pm" : "Off - type times to enable (e.g. 9am-5pm)"
          }
          className={`w-full rounded-lg border bg-transparent px-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring/50 ${
            compact ? "h-8" : "h-10"
          } ${
            error
              ? "border-destructive text-destructive"
              : isActive
                ? "border-border text-foreground"
                : "border-border/50 text-muted-foreground"
          }`}
          aria-label={`Availability times for ${day.label}`}
          aria-invalid={!!error}
        />
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function WeeklyScheduleEditorBody({
  calendarId,
  timezone: _timezone,
  compact,
}: WeeklyScheduleEditorBodyProps) {
  const queryClient = useQueryClient();

  const [schedule, setSchedule] = useState<WeeklySchedule>(
    createEmptyWeeklySchedule(),
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch availability rules
  const { data: rulesData, isLoading } = useQuery(
    orpc.availability.rules.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );
  const baseSchedule = useMemo(
    () => buildWeeklyScheduleFromRules(rulesData?.items),
    [rulesData?.items],
  );
  const activeSchedule = hasChanges ? schedule : baseSchedule;

  // Set weekly availability mutation
  const setWeeklyMutation = useMutation(
    orpc.availability.rules.setWeekly.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.availability.key() });
        setHasChanges(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save weekly schedule");
      },
    }),
  );

  const getDay = (weekday: number): DaySchedule =>
    activeSchedule[weekday] ?? { enabled: false, blocks: [] };

  const updateDay = useCallback(
    (weekday: number, daySchedule: DaySchedule) => {
      setSchedule((prev) => ({
        ...(hasChanges ? prev : activeSchedule),
        [weekday]: daySchedule,
      }));
      setHasChanges(true);
    },
    [activeSchedule, hasChanges],
  );

  const copyMondayToWeekdays = () => {
    const monday = getDay(1);
    const copiedBlocks = monday.blocks.map((b) => ({ ...b }));
    setSchedule((prev) => ({
      ...(hasChanges ? prev : activeSchedule),
      2: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((b) => ({ ...b })),
      },
      3: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((b) => ({ ...b })),
      },
      4: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((b) => ({ ...b })),
      },
      5: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((b) => ({ ...b })),
      },
    }));
    setHasChanges(true);
  };

  const clearAll = () => {
    setSchedule(createEmptyWeeklySchedule());
    setHasChanges(true);
  };

  const handleSave = () => {
    const rules: Array<{
      weekday: number;
      startTime: string;
      endTime: string;
    }> = [];

    for (const [weekdayStr, daySchedule] of Object.entries(activeSchedule)) {
      const weekday = parseInt(weekdayStr, 10);
      if (daySchedule.enabled) {
        for (const block of daySchedule.blocks) {
          rules.push({
            weekday,
            startTime: block.startTime,
            endTime: block.endTime,
          });
        }
      }
    }

    setWeeklyMutation.mutate({ calendarId, rules });
  };

  useSubmitShortcut({
    enabled: hasChanges && !setWeeklyMutation.isPending,
    onSubmit: handleSave,
  });

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground py-8">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hint */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Type time ranges for each day, e.g.{" "}
        <span className="font-medium text-foreground/70">9am-5pm</span> or{" "}
        <span className="font-medium text-foreground/70">
          9am-12pm, 1pm-5pm
        </span>
        . Leave blank for days off. Press Enter or click away to apply.
      </p>

      {/* Day Rows */}
      <div className="space-y-2">
        {WEEKDAYS.map((day) => (
          <DayTimeInput
            key={day.value}
            day={day}
            daySchedule={getDay(day.value)}
            onUpdate={updateDay}
            compact={compact}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            onClick={copyMondayToWeekdays}
            disabled={!getDay(1).enabled}
          >
            <Icon icon={Copy01Icon} className="mr-1.5" />
            {compact ? "Copy Mon" : "Copy Monday to weekdays"}
          </Button>
          <Button
            variant="ghost"
            size={compact ? "sm" : "default"}
            onClick={clearAll}
          >
            <Icon icon={Cancel01Icon} className="mr-1.5" />
            Clear
          </Button>
        </div>
        <Button
          size={compact ? "sm" : "default"}
          onClick={handleSave}
          disabled={!hasChanges || setWeeklyMutation.isPending}
        >
          <Icon icon={FloppyDiskIcon} className="mr-1.5" />
          {setWeeklyMutation.isPending ? "Saving..." : "Save"}
          <ShortcutBadge
            shortcut="meta+enter"
            className="ml-2 hidden sm:inline-flex"
          />
        </Button>
      </div>
    </div>
  );
}
