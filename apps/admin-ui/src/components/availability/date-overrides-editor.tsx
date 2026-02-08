// Date overrides editor - self-contained component for managing date-specific availability

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar03Icon,
  Delete01Icon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniCalendar } from "./mini-calendar";
import { formatDate, formatDisplayDate } from "./utils";
import {
  formatTimeBlocksForInput,
  parseTimeRanges,
  validateTimeBlocks,
} from "./time-range-parser";

interface DateOverridesEditorProps {
  calendarId: string;
  timezone: string;
}

interface DateOverridesEditorBodyProps extends DateOverridesEditorProps {
  compact: boolean;
}

interface EditingOverride {
  id?: string;
  date: string;
  timeRangesInput: string;
}

export function DateOverridesEditor(props: DateOverridesEditorProps) {
  return <DateOverridesEditorBody {...props} compact={false} />;
}

export function CompactDateOverridesEditor(props: DateOverridesEditorProps) {
  return <DateOverridesEditorBody {...props} compact />;
}

function DateOverridesEditorBody({
  calendarId,
  timezone,
  compact,
}: DateOverridesEditorBodyProps) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<DateTime | null>(null);
  const [editingOverride, setEditingOverride] =
    useState<EditingOverride | null>(null);
  const [timeRangesError, setTimeRangesError] = useState<string | null>(null);

  const { data: overridesData, isLoading } = useQuery(
    orpc.availability.overrides.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
  );

  const overrides = overridesData?.items ?? [];
  const markedDates = useMemo(
    () => new Set(overrides.map((override) => override.date)),
    [overrides],
  );

  const createMutation = useMutation(
    orpc.availability.overrides.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.availability.overrides.key(),
        });
        setEditingOverride(null);
        setSelectedDate(null);
        setTimeRangesError(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create date override");
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
        setTimeRangesError(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update date override");
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
      onError: (error) => {
        toast.error(error.message || "Failed to delete date override");
      },
    }),
  );

  const openEditor = (
    date: DateTime,
    override?: {
      id: string;
      date: string;
      timeRanges: Array<{ startTime: string; endTime: string }>;
    },
  ) => {
    setSelectedDate(date);
    setTimeRangesError(null);

    if (override) {
      setEditingOverride({
        id: override.id,
        date: override.date,
        timeRangesInput: formatTimeBlocksForInput(override.timeRanges),
      });
      return;
    }

    setEditingOverride({
      date: formatDate(date),
      timeRangesInput: "",
    });
  };

  const handleDateSelect = (date: DateTime) => {
    const dateStr = formatDate(date);
    const existing = overrides.find((override) => override.date === dateStr);

    if (existing) {
      openEditor(date, {
        id: existing.id,
        date: existing.date,
        timeRanges: existing.timeRanges,
      });
      return;
    }

    openEditor(date);
  };

  const handleSave = () => {
    if (!editingOverride) return;

    const raw = editingOverride.timeRangesInput.trim();
    const timeRanges = raw ? parseTimeRanges(raw) : [];

    if (raw && timeRanges.length === 0) {
      setTimeRangesError("Could not parse time ranges. Try: 9am-5pm");
      return;
    }

    const validationError = validateTimeBlocks(timeRanges);
    if (validationError) {
      setTimeRangesError(validationError);
      return;
    }

    setTimeRangesError(null);

    const data = {
      date: editingOverride.date,
      timeRanges,
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

  const clearEditor = () => {
    setEditingOverride(null);
    setSelectedDate(null);
    setTimeRangesError(null);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon icon={Calendar03Icon} className="text-muted-foreground" />
            <span className="text-sm font-medium">Select Date</span>
          </div>
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            markedDates={markedDates}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Click a date to add or edit an override. Dates with dots have
            existing overrides.
          </p>
        </div>

        {editingOverride && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <h4 className="text-sm font-medium">
              {editingOverride.id ? "Edit Override" : "Add Override"} -{" "}
              {formatDisplayDate(editingOverride.date, timezone)}
            </h4>

            <div className="space-y-1.5">
              <Label className="text-xs">Time ranges</Label>
              <Input
                type="text"
                value={editingOverride.timeRangesInput}
                onChange={(event) => {
                  setEditingOverride((prev) =>
                    prev
                      ? {
                          ...prev,
                          timeRangesInput: event.target.value,
                        }
                      : null,
                  );
                }}
                placeholder="Leave blank to block date, or type e.g. 9am-12pm, 1pm-5pm"
                aria-invalid={!!timeRangesError}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to block the entire date.
              </p>
              {timeRangesError && (
                <p className="text-xs text-destructive" role="alert">
                  {timeRangesError}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Icon icon={FloppyDiskIcon} className="mr-1.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={clearEditor}>
                Cancel
              </Button>
              {editingOverride.id && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(editingOverride.id!)}
                  disabled={deleteMutation.isPending}
                  className="ml-auto"
                >
                  <Icon icon={Delete01Icon} />
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-medium">Upcoming Overrides</h4>
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No date overrides configured.
            </p>
          ) : (
            <div className="space-y-1.5">
              {overrides
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((override) => {
                  const summary =
                    override.timeRanges.length === 0
                      ? "Blocked"
                      : formatTimeBlocksForInput(override.timeRanges);

                  return (
                    <div
                      key={override.id}
                      className="flex cursor-pointer items-center justify-between rounded-md bg-muted/30 px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                      onClick={() =>
                        openEditor(DateTime.fromISO(override.date), {
                          id: override.id,
                          date: override.date,
                          timeRanges: override.timeRanges,
                        })
                      }
                    >
                      <div>
                        <span className="font-medium">
                          {formatDisplayDate(override.date, timezone)}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {summary}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(override.id);
                        }}
                      >
                        <Icon icon={Delete01Icon} />
                      </Button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
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
          <p className="mt-4 text-sm text-muted-foreground">
            Click a date to add or edit an override. Dates with dots have
            existing overrides.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {editingOverride && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingOverride.id ? "Edit Override" : "Add Override"} -{" "}
                {formatDisplayDate(editingOverride.date, timezone)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Time ranges</Label>
                <Input
                  type="text"
                  value={editingOverride.timeRangesInput}
                  onChange={(event) => {
                    setEditingOverride((prev) =>
                      prev
                        ? {
                            ...prev,
                            timeRangesInput: event.target.value,
                          }
                        : null,
                    );
                  }}
                  placeholder="Leave blank to block date, or type e.g. 9am-12pm, 1pm-5pm"
                  aria-invalid={!!timeRangesError}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to block the entire date.
                </p>
                {timeRangesError && (
                  <p className="text-xs text-destructive" role="alert">
                    {timeRangesError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={isSaving}>
                  <Icon icon={FloppyDiskIcon} className="mr-2" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                <Button variant="ghost" onClick={clearEditor}>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {overrides.length === 0 ? (
              <p className="text-muted-foreground">
                No date overrides configured. Click a date on the calendar to
                add one.
              </p>
            ) : (
              <div className="space-y-2">
                {overrides
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((override) => {
                    const summary =
                      override.timeRanges.length === 0
                        ? "Blocked"
                        : formatTimeBlocksForInput(override.timeRanges);

                    return (
                      <div
                        key={override.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
                        onClick={() =>
                          openEditor(DateTime.fromISO(override.date), {
                            id: override.id,
                            date: override.date,
                            timeRanges: override.timeRanges,
                          })
                        }
                      >
                        <div>
                          <span className="font-medium">
                            {formatDisplayDate(override.date, timezone)}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {summary}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(override.id);
                          }}
                        >
                          <Icon icon={Delete01Icon} />
                        </Button>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
