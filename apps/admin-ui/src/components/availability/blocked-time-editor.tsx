// Blocked time editor - self-contained component for managing blocked time periods

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECURRENCE_OPTIONS, WEEKDAYS } from "./constants";
import type { AvailabilityPreviewBlockedTimeDraft } from "./constants";
import { formatTime24to12, parseTimeInput } from "./time-range-parser";
import {
  buildRecurrenceRule,
  type BlockRecurrenceType,
  formatDisplayDate,
  formatDisplayDateTime,
  getTomorrowInTimezone,
  parseInTimezone,
  parseISOInTimezone,
  parseRecurrenceRule,
} from "./utils";

interface BlockedTimeEditorProps {
  calendarId: string;
  timezone: string;
  onDraftBlockedTimeChange?: (
    blockedTime: AvailabilityPreviewBlockedTimeDraft[] | null,
  ) => void;
}

interface BlockedTimeEditorBodyProps extends BlockedTimeEditorProps {
  compact: boolean;
}

const toRecurrenceValue = (
  value: BlockRecurrenceType | "custom",
): BlockRecurrenceType => {
  return value === "daily" || value === "weekly" ? value : "none";
};

export function BlockedTimeEditor(props: BlockedTimeEditorProps) {
  return <BlockedTimeEditorBody {...props} compact={false} />;
}

export function CompactBlockedTimeEditor(props: BlockedTimeEditorProps) {
  return <BlockedTimeEditorBody {...props} compact />;
}

function TimeTextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(() => formatTime24to12(value));

  useEffect(() => {
    setDraftValue(formatTime24to12(value));
  }, [value]);

  const commitValue = () => {
    const parsed = parseTimeInput(draftValue);
    if (!parsed) {
      setDraftValue(formatTime24to12(value));
      return;
    }
    onChange(parsed);
    setDraftValue(formatTime24to12(parsed));
  };

  return (
    <Input
      type="text"
      inputMode="text"
      value={draftValue}
      placeholder="9:00 AM"
      onChange={(e) => setDraftValue(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commitValue();
      }}
    />
  );
}

function BlockedTimeEditorBody({
  calendarId,
  timezone,
  compact,
  onDraftBlockedTimeChange,
}: BlockedTimeEditorBodyProps) {
  type EditingBlock = {
    id?: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    recurrence: BlockRecurrenceType;
    weekdays: number[];
  };

  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch blocked time
  const { data: blockedData, isLoading } = useQuery(
    orpc.availability.blockedTime.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  const blockedTimes = blockedData?.items ?? [];
  const toDateTime = (value: string | Date) =>
    typeof value === "string"
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value);
  const getWeekdayFromDate = (date: string): number => {
    const dt = DateTime.fromISO(date);
    return dt.isValid ? dt.weekday % 7 : 1;
  };
  const getWeekdaysFromDateSpan = (startDate: string, endDate: string) => {
    const start = DateTime.fromISO(startDate).startOf("day");
    const end = DateTime.fromISO(endDate).startOf("day");
    if (!start.isValid || !end.isValid || end < start) return [];

    const days = new Set<number>();
    let cursor = start;
    // Weekdays repeat every 7 days; cap iteration to one cycle for safety.
    while (cursor <= end && days.size < 7) {
      days.add(cursor.weekday % 7);
      cursor = cursor.plus({ days: 1 });
    }

    return Array.from(days).toSorted((a, b) => a - b);
  };
  const toggleWeekday = (weekday: number) => {
    setEditingBlock((prev) => {
      if (!prev) return null;
      const hasDay = prev.weekdays.includes(weekday);
      return {
        ...prev,
        weekdays: hasDay
          ? prev.weekdays.filter((d) => d !== weekday)
          : [...prev.weekdays, weekday].toSorted((a, b) => a - b),
      };
    });
  };
  const parseRuleForBlock = (block: (typeof blockedTimes)[number]) =>
    parseRecurrenceRule(block.recurringRule, timezone);
  const getRecurringDisplayRange = (block: (typeof blockedTimes)[number]) => {
    const start = toDateTime(block.startAt).setZone(timezone);
    const parsed = parseRuleForBlock(block);
    const startDate = start.toISODate();
    const endDate =
      parsed.untilDate ?? toDateTime(block.endAt).setZone(timezone).toISODate();

    if (!startDate || !endDate) return null;
    return `${formatDisplayDate(startDate, timezone)} to ${formatDisplayDate(endDate, timezone)}`;
  };
  const getBlockTitle = (block: (typeof blockedTimes)[number]) => {
    const start = toDateTime(block.startAt).setZone(timezone);
    const end = toDateTime(block.endAt).setZone(timezone);
    const parsed = parseRuleForBlock(block);

    if (parsed.type === "none" || parsed.type === "custom") {
      return `${formatDisplayDateTime(block.startAt, timezone)} - ${formatDisplayDateTime(block.endAt, timezone)}`;
    }

    const range = getRecurringDisplayRange(block);
    const timeWindow = `${start.toFormat("h:mm a")} - ${end.toFormat("h:mm a")}`;
    return range ? `${timeWindow} · ${range}` : timeWindow;
  };
  const getRecurrenceSummary = (block: (typeof blockedTimes)[number]) => {
    const parsed = parseRuleForBlock(block);

    if (parsed.type === "daily") {
      return "Repeats daily";
    }

    if (parsed.type === "weekly") {
      const startDate = toDateTime(block.startAt).setZone(timezone).toISODate();
      const endDate = toDateTime(block.endAt).setZone(timezone).toISODate();
      const fallbackWeekdays =
        startDate && endDate
          ? getWeekdaysFromDateSpan(startDate, endDate)
          : [toDateTime(block.startAt).setZone(timezone).weekday % 7];
      const weekdayLabels = (
        parsed.weekdays.length ? parsed.weekdays : fallbackWeekdays
      ).flatMap((weekday) => {
        const label = WEEKDAYS.find((day) => day.value === weekday)?.short;
        return label ? [label] : [];
      });
      return `Repeats weekly on ${weekdayLabels.join(", ")}`;
    }

    return "One-time block";
  };

  // Mutations
  const createMutation = useMutation(
    orpc.availability.blockedTime.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.blockedTime.key(),
        });
        setEditingBlock(null);
        setFormError(null);
        setShowForm(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create blocked time");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.availability.blockedTime.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.blockedTime.key(),
        });
        setEditingBlock(null);
        setFormError(null);
        setShowForm(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update blocked time");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.availability.blockedTime.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.blockedTime.key(),
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete blocked time");
      },
    }),
  );

  const handleAddNew = () => {
    const tomorrow = getTomorrowInTimezone(timezone);

    setEditingBlock({
      startDate: tomorrow,
      startTime: "09:00",
      endDate: tomorrow,
      endTime: "17:00",
      recurrence: "none",
      weekdays: [getWeekdayFromDate(tomorrow)],
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleEdit = (block: (typeof blockedTimes)[0]) => {
    const startParts = parseISOInTimezone(block.startAt, timezone);
    const endParts = parseISOInTimezone(block.endAt, timezone);
    const parsed = parseRuleForBlock(block);
    const recurrence = toRecurrenceValue(parsed.type);
    const fallbackWeekdays = getWeekdaysFromDateSpan(
      startParts.date,
      endParts.date,
    );
    const weekdays =
      recurrence === "weekly"
        ? (parsed.weekdays.length
            ? parsed.weekdays
            : fallbackWeekdays.length
              ? fallbackWeekdays
              : [getWeekdayFromDate(startParts.date)]
          ).toSorted((a, b) => a - b)
        : [];

    setEditingBlock({
      id: block.id,
      startDate: startParts.date,
      startTime: startParts.time,
      endDate: parsed.untilDate ?? endParts.date,
      endTime: endParts.time,
      recurrence,
      weekdays,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!editingBlock) return;
    setFormError(null);

    const startDate = DateTime.fromISO(editingBlock.startDate);
    const endDate = DateTime.fromISO(editingBlock.endDate);
    if (!startDate.isValid || !endDate.isValid) {
      setFormError("Select a valid date range.");
      return;
    }
    if (endDate < startDate) {
      setFormError("End date must be on or after start date.");
      return;
    }

    const isRecurring = editingBlock.recurrence !== "none";
    if (isRecurring && editingBlock.endTime <= editingBlock.startTime) {
      setFormError("For recurring blocks, end time must be after start time.");
      return;
    }
    if (
      editingBlock.recurrence === "weekly" &&
      editingBlock.weekdays.length === 0
    ) {
      setFormError("Select at least one weekday for weekly recurrence.");
      return;
    }

    // Parse dates/times in the calendar's timezone, then convert to ISO for API
    const startAt = parseInTimezone(
      editingBlock.startDate,
      editingBlock.startTime,
      timezone,
    );
    const endAt = parseInTimezone(
      isRecurring ? editingBlock.startDate : editingBlock.endDate,
      editingBlock.endTime,
      timezone,
    );
    const recurringRule = buildRecurrenceRule({
      type: editingBlock.recurrence,
      startDate: editingBlock.startDate,
      startTime: editingBlock.startTime,
      endDate: editingBlock.endDate,
      timezone,
      weekdays: editingBlock.weekdays,
    });

    const startAtDt = DateTime.fromISO(startAt);
    const endAtDt = DateTime.fromISO(endAt);
    if (!startAtDt.isValid || !endAtDt.isValid || endAtDt <= startAtDt) {
      setFormError("End must be after start.");
      return;
    }
    if (isRecurring && !recurringRule) {
      setFormError("Invalid recurrence settings.");
      return;
    }

    const data = {
      startAt,
      endAt,
      recurringRule: recurringRule ?? undefined,
    };

    if (editingBlock.id) {
      updateMutation.mutate({ id: editingBlock.id, data });
    } else {
      createMutation.mutate({ calendarId, data });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSave = !!editingBlock && !isSaving;

  useEffect(() => {
    if (!onDraftBlockedTimeChange) return;

    if (!showForm || !editingBlock) {
      onDraftBlockedTimeChange(null);
      return;
    }

    const startAtIso = parseInTimezone(
      editingBlock.startDate,
      editingBlock.startTime,
      timezone,
    );
    const endAtIso = parseInTimezone(
      editingBlock.recurrence !== "none"
        ? editingBlock.startDate
        : editingBlock.endDate,
      editingBlock.endTime,
      timezone,
    );
    const startAt = DateTime.fromISO(startAtIso);
    const endAt = DateTime.fromISO(endAtIso);
    if (!startAt.isValid || !endAt.isValid || endAt <= startAt) {
      onDraftBlockedTimeChange(null);
      return;
    }

    const recurringRule = buildRecurrenceRule({
      type: editingBlock.recurrence,
      startDate: editingBlock.startDate,
      startTime: editingBlock.startTime,
      endDate: editingBlock.endDate,
      timezone,
      weekdays: editingBlock.weekdays,
    });

    const draftBlock: AvailabilityPreviewBlockedTimeDraft = {
      startAt: startAt.toJSDate(),
      endAt: endAt.toJSDate(),
      recurringRule: recurringRule ?? null,
    };

    const persisted = blockedTimes.map((block) => ({
      id: block.id,
      startAt:
        block.startAt instanceof Date ? block.startAt : new Date(block.startAt),
      endAt: block.endAt instanceof Date ? block.endAt : new Date(block.endAt),
      recurringRule: block.recurringRule,
    }));

    const merged = editingBlock.id
      ? persisted.map((block) =>
          block.id === editingBlock.id
            ? { ...draftBlock, id: block.id }
            : { ...block },
        )
      : [...persisted, { ...draftBlock, id: "draft-new-block" }];

    onDraftBlockedTimeChange(
      merged.map((block) => ({
        startAt: block.startAt,
        endAt: block.endAt,
        recurringRule: block.recurringRule ?? null,
      })),
    );
  }, [
    blockedTimes,
    editingBlock,
    onDraftBlockedTimeChange,
    showForm,
    timezone,
  ]);

  useSubmitShortcut({
    enabled: canSave,
    onSubmit: handleSave,
  });

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground py-8">Loading...</div>
    );
  }

  // Compact layout
  if (compact) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Blocked Time</h3>
            <p className="text-xs text-muted-foreground">
              Block time for vacations, meetings, and unavailable periods.
            </p>
          </div>
          <Button size="sm" onClick={handleAddNew}>
            <Icon icon={Add01Icon} className="mr-1.5" />
            Add
          </Button>
        </div>

        {/* Add/Edit Form */}
        {showForm && editingBlock && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-medium">
              {editingBlock.id ? "Edit Block" : "Add Blocked Time"}
            </h4>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={editingBlock.startDate}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, startDate: e.target.value } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={editingBlock.endDate}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, endDate: e.target.value } : null,
                    )
                  }
                />
              </div>
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Time</Label>
                <TimeTextInput
                  value={editingBlock.startTime}
                  onChange={(value) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, startTime: value } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
                <TimeTextInput
                  value={editingBlock.endTime}
                  onChange={(value) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, endTime: value } : null,
                    )
                  }
                />
              </div>
            </div>

            {/* Recurrence */}
            <div className="space-y-1">
              <Label className="text-xs">Repeats</Label>
              <Select
                value={editingBlock.recurrence}
                onValueChange={(value) =>
                  setEditingBlock((prev) =>
                    prev
                      ? {
                          ...prev,
                          recurrence:
                            value === "daily" || value === "weekly"
                              ? value
                              : "none",
                          weekdays:
                            value === "weekly"
                              ? prev.weekdays.length
                                ? prev.weekdays
                                : [getWeekdayFromDate(prev.startDate)]
                              : [],
                        }
                      : null,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {resolveSelectValueLabel({
                      value: editingBlock.recurrence,
                      options: RECURRENCE_OPTIONS,
                      getOptionValue: (option) => option.value,
                      getOptionLabel: (option) => option.label,
                      noneLabel: "Does not repeat",
                      unknownLabel: "Unknown recurrence",
                    })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingBlock.recurrence === "weekly" && (
              <div className="space-y-1">
                <Label className="text-xs">Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const selected = editingBlock.weekdays.includes(day.value);
                    return (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.short}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            {formError && (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Icon icon={FloppyDiskIcon} className="mr-1.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingBlock(null);
                  setShowForm(false);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              {editingBlock.id && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(editingBlock.id!)}
                  disabled={deleteMutation.isPending}
                  className="ml-auto"
                >
                  <Icon icon={Delete01Icon} />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Blocked Time List */}
        <div className="rounded-lg border border-border bg-card p-4">
          {blockedTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No blocked time configured.
            </p>
          ) : (
            <div className="space-y-2">
              {blockedTimes
                .toSorted(
                  (a, b) =>
                    toDateTime(a.startAt).toMillis() -
                    toDateTime(b.startAt).toMillis(),
                )
                .map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between p-2 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer text-sm"
                    onClick={() => handleEdit(block)}
                  >
                    <div>
                      <div className="font-medium">{getBlockTitle(block)}</div>
                      <div className="text-xs text-muted-foreground">
                        {getRecurrenceSummary(block)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(block.id);
                      }}
                    >
                      <Icon icon={Delete01Icon} />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full layout
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Blocked Time</h3>
          <p className="text-sm text-muted-foreground">
            Block time for vacations, recurring meetings, and other unavailable
            periods.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Icon icon={Add01Icon} className="mr-2" />
          Add Block
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && editingBlock && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingBlock.id ? "Edit Block" : "Add Blocked Time"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input
                  type="date"
                  value={editingBlock.startDate}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, startDate: e.target.value } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input
                  type="date"
                  value={editingBlock.endDate}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, endDate: e.target.value } : null,
                    )
                  }
                />
              </div>
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <TimeTextInput
                  value={editingBlock.startTime}
                  onChange={(value) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, startTime: value } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <TimeTextInput
                  value={editingBlock.endTime}
                  onChange={(value) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, endTime: value } : null,
                    )
                  }
                />
              </div>
            </div>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select
                value={editingBlock.recurrence}
                onValueChange={(value) =>
                  setEditingBlock((prev) =>
                    prev
                      ? {
                          ...prev,
                          recurrence:
                            value === "daily" || value === "weekly"
                              ? value
                              : "none",
                          weekdays:
                            value === "weekly"
                              ? prev.weekdays.length
                                ? prev.weekdays
                                : [getWeekdayFromDate(prev.startDate)]
                              : [],
                        }
                      : null,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {resolveSelectValueLabel({
                      value: editingBlock.recurrence,
                      options: RECURRENCE_OPTIONS,
                      getOptionValue: (option) => option.value,
                      getOptionLabel: (option) => option.label,
                      noneLabel: "Does not repeat",
                      unknownLabel: "Unknown recurrence",
                    })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingBlock.recurrence === "weekly" && (
              <div className="space-y-1.5">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const selected = editingBlock.weekdays.includes(day.value);
                    return (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select which days this recurring block applies to.
                </p>
              </div>
            )}
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                <Icon icon={FloppyDiskIcon} className="mr-2" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingBlock(null);
                  setShowForm(false);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              {editingBlock.id && (
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(editingBlock.id!)}
                  disabled={deleteMutation.isPending}
                  className="ml-auto"
                >
                  <Icon icon={Delete01Icon} className="mr-2" />
                  Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocked Time List */}
      <Card>
        <CardContent className="pt-6">
          {blockedTimes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No blocked time configured. Add blocks for vacations, meetings, or
              other unavailable periods.
            </p>
          ) : (
            <div className="space-y-3">
              {blockedTimes
                .toSorted(
                  (a, b) =>
                    toDateTime(a.startAt).toMillis() -
                    toDateTime(b.startAt).toMillis(),
                )
                .map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleEdit(block)}
                  >
                    <div>
                      <div className="font-medium">{getBlockTitle(block)}</div>
                      <div className="text-sm text-muted-foreground">
                        {getRecurrenceSummary(block)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(block);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(block.id);
                        }}
                      >
                        <Icon icon={Delete01Icon} />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
