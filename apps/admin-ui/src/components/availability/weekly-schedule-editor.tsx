// Weekly schedule editor - self-contained component for managing weekly availability

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
  Copy01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  WEEKDAYS,
  type TimeBlock,
  type DaySchedule,
  type WeeklySchedule,
} from "./constants";

interface WeeklyScheduleEditorProps {
  calendarId: string;
  timezone: string;
  compact?: boolean;
}

export function WeeklyScheduleEditor({
  calendarId,
  timezone: _timezone,
  compact = false,
}: WeeklyScheduleEditorProps) {
  const queryClient = useQueryClient();

  const [schedule, setSchedule] = useState<WeeklySchedule>(
    Object.fromEntries(
      WEEKDAYS.map((d) => [d.value, { enabled: false, blocks: [] }]),
    ) as WeeklySchedule,
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch availability rules
  const { data: rulesData, isLoading } = useQuery(
    orpc.availability.rules.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  // Initialize schedule from rules
  useEffect(() => {
    if (rulesData?.items && !hasChanges) {
      const newSchedule = Object.fromEntries(
        WEEKDAYS.map((d) => [d.value, { enabled: false, blocks: [] }]),
      ) as WeeklySchedule;

      for (const rule of rulesData.items) {
        const dayEntry = newSchedule[rule.weekday] ?? {
          enabled: false,
          blocks: [],
        };
        dayEntry.enabled = true;
        dayEntry.blocks.push({
          startTime: rule.startTime,
          endTime: rule.endTime,
        });
        newSchedule[rule.weekday] = dayEntry;
      }

      setSchedule(newSchedule);
    }
  }, [rulesData, hasChanges]);

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
    schedule[weekday] ?? { enabled: false, blocks: [] };

  const toggleDay = (weekday: number) => {
    const current = getDay(weekday);
    setSchedule((prev) => ({
      ...prev,
      [weekday]: {
        enabled: !current.enabled,
        blocks: current.blocks,
      },
    }));
    setHasChanges(true);
  };

  const addBlock = (weekday: number) => {
    const current = getDay(weekday);
    setSchedule((prev) => ({
      ...prev,
      [weekday]: {
        enabled: true,
        blocks: [...current.blocks, { startTime: "09:00", endTime: "17:00" }],
      },
    }));
    setHasChanges(true);
  };

  const updateBlock = (
    weekday: number,
    blockIndex: number,
    updates: Partial<TimeBlock>,
  ) => {
    const current = getDay(weekday);
    setSchedule((prev) => ({
      ...prev,
      [weekday]: {
        enabled: current.enabled,
        blocks: current.blocks.map((block, i) =>
          i === blockIndex ? { ...block, ...updates } : block,
        ),
      },
    }));
    setHasChanges(true);
  };

  const removeBlock = (weekday: number, blockIndex: number) => {
    const current = getDay(weekday);
    const newBlocks = current.blocks.filter((_, i) => i !== blockIndex);
    setSchedule((prev) => ({
      ...prev,
      [weekday]: {
        enabled: newBlocks.length > 0,
        blocks: newBlocks,
      },
    }));
    setHasChanges(true);
  };

  const copyMondayToWeekdays = () => {
    const monday = getDay(1);
    const copiedBlocks = monday.blocks.map((b) => ({ ...b }));
    setSchedule((prev) => ({
      ...prev,
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
    setSchedule(
      Object.fromEntries(
        WEEKDAYS.map((d) => [d.value, { enabled: false, blocks: [] }]),
      ) as WeeklySchedule,
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    const rules: Array<{
      weekday: number;
      startTime: string;
      endTime: string;
    }> = [];

    for (const [weekdayStr, daySchedule] of Object.entries(schedule)) {
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

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground py-8">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {compact ? (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={copyMondayToWeekdays}
                disabled={!getDay(1).enabled}
                title="Copy Monday to weekdays"
              >
                <Icon icon={Copy01Icon} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearAll}
                title="Clear all"
              >
                <Icon icon={Cancel01Icon} />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={copyMondayToWeekdays}
                disabled={!getDay(1).enabled}
              >
                <Icon icon={Copy01Icon} className="mr-1.5" />
                Copy Monday to weekdays
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Icon icon={Cancel01Icon} className="mr-1.5" />
                Clear all
              </Button>
            </>
          )}
        </div>
        <Button
          size={compact ? "sm" : "default"}
          onClick={handleSave}
          disabled={!hasChanges || setWeeklyMutation.isPending}
        >
          <Icon icon={FloppyDiskIcon} className="mr-2" />
          {setWeeklyMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Day Rows */}
      <div className="space-y-2">
        {WEEKDAYS.map((day) => {
          const daySchedule = getDay(day.value);
          return (
            <div
              key={day.value}
              className="rounded-lg border border-border/50 bg-card overflow-hidden"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                <Checkbox
                  checked={daySchedule.enabled}
                  onChange={() => toggleDay(day.value)}
                  label={compact ? day.short : day.label}
                />
                {daySchedule.enabled && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => addBlock(day.value)}
                  >
                    <Icon icon={Add01Icon} className={compact ? "" : "mr-1"} />
                    {!compact && "Add"}
                  </Button>
                )}
              </div>

              {/* Time Blocks */}
              {daySchedule.enabled && daySchedule.blocks.length > 0 && (
                <div className="px-3 py-2 space-y-2">
                  {daySchedule.blocks.map((block, blockIndex) => (
                    <div
                      key={blockIndex}
                      className="flex items-center gap-2 flex-wrap"
                    >
                      <Input
                        type="time"
                        value={block.startTime}
                        onChange={(e) =>
                          updateBlock(day.value, blockIndex, {
                            startTime: e.target.value,
                          })
                        }
                        className="w-24"
                      />
                      <span className="text-muted-foreground text-sm">-</span>
                      <Input
                        type="time"
                        value={block.endTime}
                        onChange={(e) =>
                          updateBlock(day.value, blockIndex, {
                            endTime: e.target.value,
                          })
                        }
                        className="w-24"
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeBlock(day.value, blockIndex)}
                      >
                        <Icon icon={Delete01Icon} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Closed message */}
              {!daySchedule.enabled && (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">
                  Closed
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
