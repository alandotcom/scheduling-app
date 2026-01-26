// Calendar availability editor - manage weekly hours, date overrides, and blocked time

import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
  Copy01Icon,
  Cancel01Icon,
  Calendar03Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Breadcrumb } from "@/components/breadcrumb";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ============================================================================
// TYPES
// ============================================================================

const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "weekdays", label: "Weekdays (Mon-Fri)" },
];

interface TimeBlock {
  startTime: string;
  endTime: string;
}

interface DaySchedule {
  enabled: boolean;
  blocks: TimeBlock[];
}

type WeeklySchedule = Record<number, DaySchedule>;

type TabType = "weekly" | "overrides" | "blocked";

// ============================================================================
// UTILITIES
// ============================================================================

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayDateTime(dateOrString: Date | string): string {
  const date =
    dateOrString instanceof Date ? dateOrString : new Date(dateOrString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add padding for days before the first of the month
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push(date);
  }

  // Add all days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add padding for days after the last of the month
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function rruleToLabel(rrule: string | null): string {
  if (!rrule) return "One-time block";
  if (rrule.includes("FREQ=DAILY")) return "Repeats daily";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "Repeats weekdays";
  if (rrule.includes("FREQ=WEEKLY")) return "Repeats weekly";
  return "Custom recurrence";
}

function recurrenceToRrule(type: string): string | null {
  switch (type) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    default:
      return null;
  }
}

function rruleToRecurrence(rrule: string | null): string {
  if (!rrule) return "none";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (rrule.includes("FREQ=DAILY")) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  return "none";
}

// ============================================================================
// TAB BUTTON GROUP
// ============================================================================

function TabGroup({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  const tabs: { id: TabType; label: string }[] = [
    { id: "weekly", label: "Weekly Schedule" },
    { id: "overrides", label: "Date Overrides" },
    { id: "blocked", label: "Blocked Time" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// CHECKBOX COMPONENT
// ============================================================================

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 group"
    >
      <div
        className={`size-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
          checked
            ? "bg-primary border-primary"
            : "border-border group-hover:border-primary/50"
        }`}
      >
        {checked && (
          <Icon icon={Tick02Icon} className="size-3 text-primary-foreground" />
        )}
      </div>
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
    </button>
  );
}

// ============================================================================
// WEEKLY SCHEDULE COMPONENT
// ============================================================================

function WeeklyScheduleTab({
  schedule,
  setSchedule,
  hasChanges,
  setHasChanges,
  onSave,
  isSaving,
}: {
  schedule: WeeklySchedule;
  setSchedule: React.Dispatch<React.SetStateAction<WeeklySchedule>>;
  hasChanges: boolean;
  setHasChanges: (v: boolean) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
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

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
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
        </div>
        <Button onClick={onSave} disabled={!hasChanges || isSaving}>
          <Icon icon={FloppyDiskIcon} className="mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Day Rows */}
      <div className="space-y-3">
        {WEEKDAYS.map((day) => {
          const daySchedule = getDay(day.value);
          return (
            <div
              key={day.value}
              className="rounded-xl border border-border/50 bg-card overflow-hidden"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <Checkbox
                  checked={daySchedule.enabled}
                  onChange={() => toggleDay(day.value)}
                  label={day.label}
                />
                {daySchedule.enabled && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => addBlock(day.value)}
                  >
                    <Icon icon={Add01Icon} className="mr-1" />
                    Add
                  </Button>
                )}
              </div>

              {/* Time Blocks */}
              {daySchedule.enabled && daySchedule.blocks.length > 0 && (
                <div className="px-4 py-3 space-y-2">
                  {daySchedule.blocks.map((block, blockIndex) => (
                    <div
                      key={blockIndex}
                      className="flex items-center gap-3 flex-wrap"
                    >
                      <Input
                        type="time"
                        value={block.startTime}
                        onChange={(e) =>
                          updateBlock(day.value, blockIndex, {
                            startTime: e.target.value,
                          })
                        }
                        className="w-28"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="time"
                        value={block.endTime}
                        onChange={(e) =>
                          updateBlock(day.value, blockIndex, {
                            endTime: e.target.value,
                          })
                        }
                        className="w-28"
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
                <div className="px-4 py-2 text-sm text-muted-foreground">
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

// ============================================================================
// MINI CALENDAR COMPONENT
// ============================================================================

function MiniCalendar({
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  markedDates: Set<string>;
}) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const today = formatDate(new Date());

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthName = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="w-full max-w-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon-sm" onClick={prevMonth}>
          <Icon icon={ArrowLeft01Icon} />
        </Button>
        <span className="text-sm font-medium">{monthName}</span>
        <Button variant="ghost" size="icon-sm" onClick={nextMonth}>
          <Icon icon={ArrowRight01Icon} />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted-foreground font-medium py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, i) => {
          const dateStr = formatDate(date);
          const isCurrentMonth = date.getMonth() === month;
          const isSelected =
            selectedDate && formatDate(selectedDate) === dateStr;
          const isMarked = markedDates.has(dateStr);
          const isToday = dateStr === today;

          return (
            <button
              key={i}
              onClick={() => onSelectDate(date)}
              disabled={!isCurrentMonth}
              className={`
                relative aspect-square flex items-center justify-center text-sm rounded-md
                transition-all duration-150
                ${!isCurrentMonth ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-muted"}
                ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                ${isToday && !isSelected ? "ring-1 ring-primary" : ""}
              `}
            >
              {date.getDate()}
              {isMarked && !isSelected && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// DATE OVERRIDES TAB
// ============================================================================

function DateOverridesTab({ calendarId }: { calendarId: string }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingOverride, setEditingOverride] = useState<{
    id?: string;
    date: string;
    isBlocked: boolean;
    startTime: string;
    endTime: string;
  } | null>(null);

  // Fetch overrides
  const { data: overridesData, isLoading } = useQuery(
    orpc.availability.overrides.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  const overrides = overridesData?.items ?? [];
  const markedDates = useMemo(
    () => new Set(overrides.map((o) => o.date)),
    [overrides],
  );

  // Mutations
  const createMutation = useMutation(
    orpc.availability.overrides.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.overrides.key(),
        });
        setEditingOverride(null);
        setSelectedDate(null);
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.availability.overrides.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.overrides.key(),
        });
        setEditingOverride(null);
        setSelectedDate(null);
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.availability.overrides.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.overrides.key(),
        });
      },
    }),
  );

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    const dateStr = formatDate(date);
    const existing = overrides.find((o) => o.date === dateStr);

    if (existing) {
      setEditingOverride({
        id: existing.id,
        date: existing.date,
        isBlocked: existing.isBlocked ?? false,
        startTime: existing.startTime ?? "09:00",
        endTime: existing.endTime ?? "17:00",
      });
    } else {
      setEditingOverride({
        date: dateStr,
        isBlocked: false,
        startTime: "09:00",
        endTime: "17:00",
      });
    }
  };

  const handleSave = () => {
    if (!editingOverride) return;

    const data = editingOverride.isBlocked
      ? { date: editingOverride.date, isBlocked: true }
      : {
          date: editingOverride.date,
          isBlocked: false,
          startTime: editingOverride.startTime,
          endTime: editingOverride.endTime,
        };

    if (editingOverride.id) {
      updateMutation.mutate({ id: editingOverride.id, data });
    } else {
      createMutation.mutate({ calendarId, data });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left: Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon icon={Calendar03Icon} />
            Select Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            markedDates={markedDates}
          />
          <p className="text-sm text-muted-foreground mt-4">
            Click a date to add or edit an override. Dates with dots have
            existing overrides.
          </p>
        </CardContent>
      </Card>

      {/* Right: Override Form or List */}
      <div className="space-y-6">
        {/* Override Form */}
        {editingOverride && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingOverride.id ? "Edit Override" : "Add Override"} -{" "}
                {formatDisplayDate(editingOverride.date)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Block entire day toggle */}
              <Checkbox
                checked={editingOverride.isBlocked}
                onChange={(checked) =>
                  setEditingOverride((prev) =>
                    prev ? { ...prev, isBlocked: checked } : null,
                  )
                }
                label="Block entire day (no availability)"
              />

              {/* Custom hours form */}
              {!editingOverride.isBlocked && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="space-y-1.5">
                      <Label>Start</Label>
                      <Input
                        type="time"
                        value={editingOverride.startTime}
                        onChange={(e) =>
                          setEditingOverride((prev) =>
                            prev
                              ? { ...prev, startTime: e.target.value }
                              : null,
                          )
                        }
                        className="w-28"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End</Label>
                      <Input
                        type="time"
                        value={editingOverride.endTime}
                        onChange={(e) =>
                          setEditingOverride((prev) =>
                            prev ? { ...prev, endTime: e.target.value } : null,
                          )
                        }
                        className="w-28"
                      />
                    </div>
                  </div>
                </div>
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
                    setEditingOverride(null);
                    setSelectedDate(null);
                  }}
                >
                  Cancel
                </Button>
                {editingOverride.id && (
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(editingOverride.id!)}
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

        {/* Overrides List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : overrides.length === 0 ? (
              <p className="text-muted-foreground">
                No date overrides configured. Click a date on the calendar to
                add one.
              </p>
            ) : (
              <div className="space-y-2">
                {overrides
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((override) => (
                    <div
                      key={override.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedDate(new Date(override.date + "T00:00:00"));
                        setEditingOverride({
                          id: override.id,
                          date: override.date,
                          isBlocked: override.isBlocked ?? false,
                          startTime: override.startTime ?? "09:00",
                          endTime: override.endTime ?? "17:00",
                        });
                      }}
                    >
                      <div>
                        <span className="font-medium">
                          {formatDisplayDate(override.date)}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {override.isBlocked
                            ? "Blocked"
                            : `${override.startTime} - ${override.endTime}`}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(override.id);
                        }}
                      >
                        <Icon icon={Delete01Icon} />
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// BLOCKED TIME TAB
// ============================================================================

function BlockedTimeTab({ calendarId }: { calendarId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<{
    id?: string;
    title: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
    recurrence: string;
  } | null>(null);

  // Fetch blocked time
  const { data: blockedData, isLoading } = useQuery(
    orpc.availability.blockedTime.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  const blockedTimes = blockedData?.items ?? [];

  // Mutations
  const createMutation = useMutation(
    orpc.availability.blockedTime.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.blockedTime.key(),
        });
        setEditingBlock(null);
        setShowForm(false);
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
        setShowForm(false);
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
    }),
  );

  const handleAddNew = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    setEditingBlock({
      title: "",
      startDate: formatDate(tomorrow),
      startTime: "09:00",
      endDate: formatDate(tomorrow),
      endTime: "17:00",
      allDay: false,
      recurrence: "none",
    });
    setShowForm(true);
  };

  const handleEdit = (block: (typeof blockedTimes)[0]) => {
    const startAt = new Date(block.startAt);
    const endAt = new Date(block.endAt);

    setEditingBlock({
      id: block.id,
      title: "",
      startDate: formatDate(startAt),
      startTime: formatTime(startAt),
      endDate: formatDate(endAt),
      endTime: formatTime(endAt),
      allDay: false,
      recurrence: rruleToRecurrence(block.recurringRule),
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!editingBlock) return;

    const startAt = new Date(
      `${editingBlock.startDate}T${editingBlock.startTime}:00`,
    ).toISOString();
    const endAt = new Date(
      `${editingBlock.endDate}T${editingBlock.endTime}:00`,
    ).toISOString();
    const recurringRule = recurrenceToRrule(editingBlock.recurrence);

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
            {/* Start Date/Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
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
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={editingBlock.startTime}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, startTime: e.target.value } : null,
                    )
                  }
                />
              </div>
            </div>

            {/* End Date/Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>End Date</Label>
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
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editingBlock.endTime}
                  onChange={(e) =>
                    setEditingBlock((prev) =>
                      prev ? { ...prev, endTime: e.target.value } : null,
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
                    prev ? { ...prev, recurrence: value ?? "none" } : null,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {RECURRENCE_OPTIONS.find(
                      (o) => o.value === editingBlock.recurrence,
                    )?.label ?? "Does not repeat"}
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
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : blockedTimes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No blocked time configured. Add blocks for vacations, meetings, or
              other unavailable periods.
            </p>
          ) : (
            <div className="space-y-3">
              {blockedTimes
                .sort(
                  (a, b) =>
                    new Date(a.startAt).getTime() -
                    new Date(b.startAt).getTime(),
                )
                .map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleEdit(block)}
                  >
                    <div>
                      <div className="font-medium">
                        {formatDisplayDateTime(block.startAt)} -{" "}
                        {formatDisplayDateTime(block.endAt)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {rruleToLabel(block.recurringRule)}
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function AvailabilityPage() {
  const { calendarId } = Route.useParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("weekly");
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(
    Object.fromEntries(
      WEEKDAYS.map((d) => [d.value, { enabled: false, blocks: [] }]),
    ) as WeeklySchedule,
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch calendar details
  const { data: calendar, isLoading: calendarLoading } = useQuery(
    orpc.calendars.get.queryOptions({
      input: { id: calendarId },
    }),
  );

  // Fetch availability rules
  const { data: rulesData, isLoading: rulesLoading } = useQuery(
    orpc.availability.rules.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  // Initialize weekly schedule from rules
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

      setWeeklySchedule(newSchedule);
    }
  }, [rulesData, hasChanges]);

  // Set weekly availability mutation
  const setWeeklyMutation = useMutation(
    orpc.availability.rules.setWeekly.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.availability.key() });
        setHasChanges(false);
      },
    }),
  );

  const handleSaveWeekly = () => {
    const rules: Array<{
      weekday: number;
      startTime: string;
      endTime: string;
    }> = [];

    for (const [weekdayStr, daySchedule] of Object.entries(weeklySchedule)) {
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

  const isLoading = calendarLoading || rulesLoading;

  return (
    <div className="p-10">
      <Breadcrumb
        items={[
          { label: "Calendars", to: "/calendars" },
          { label: calendar?.name ?? "..." },
          { label: "Availability" },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {calendar?.name ?? "Calendar"} - Availability
        </h1>
        <p className="mt-2 text-muted-foreground">
          Configure when this calendar is available for appointments.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <TabGroup activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <Separator className="mb-8" />

      {/* Tab Content */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">
          Loading...
        </div>
      ) : (
        <>
          {activeTab === "weekly" && (
            <WeeklyScheduleTab
              schedule={weeklySchedule}
              setSchedule={setWeeklySchedule}
              hasChanges={hasChanges}
              setHasChanges={setHasChanges}
              onSave={handleSaveWeekly}
              isSaving={setWeeklyMutation.isPending}
            />
          )}

          {activeTab === "overrides" && (
            <DateOverridesTab calendarId={calendarId} />
          )}

          {activeTab === "blocked" && (
            <BlockedTimeTab calendarId={calendarId} />
          )}
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute(
  "/_authenticated/calendars/$calendarId/availability",
)({
  component: AvailabilityPage,
});
