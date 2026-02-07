// Date overrides editor - self-contained component for managing date-specific availability

import { useState, useMemo } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Delete01Icon,
  FloppyDiskIcon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniCalendar } from "./mini-calendar";
import { formatDate, formatDisplayDate } from "./utils";

interface DateOverridesEditorProps {
  calendarId: string;
  timezone: string;
}

interface DateOverridesEditorBodyProps extends DateOverridesEditorProps {
  compact: boolean;
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

  const handleDateSelect = (date: DateTime) => {
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

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground py-8">Loading...</div>
    );
  }

  // Compact layout: stacked single column
  if (compact) {
    return (
      <div className="space-y-4">
        {/* Calendar */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon={Calendar03Icon} className="text-muted-foreground" />
            <span className="text-sm font-medium">Select Date</span>
          </div>
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            markedDates={markedDates}
          />
          <p className="text-xs text-muted-foreground mt-3">
            Click a date to add or edit an override. Dates with dots have
            existing overrides.
          </p>
        </div>

        {/* Override Form */}
        {editingOverride && (
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <h4 className="text-sm font-medium">
              {editingOverride.id ? "Edit Override" : "Add Override"} -{" "}
              {formatDisplayDate(editingOverride.date, timezone)}
            </h4>

            <Checkbox
              checked={editingOverride.isBlocked}
              onChange={(checked) =>
                setEditingOverride((prev) =>
                  prev ? { ...prev, isBlocked: checked } : null,
                )
              }
              label="Block entire day"
            />

            {!editingOverride.isBlocked && (
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="time"
                    value={editingOverride.startTime}
                    onChange={(e) =>
                      setEditingOverride((prev) =>
                        prev ? { ...prev, startTime: e.target.value } : null,
                      )
                    }
                    className="w-24"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End</Label>
                  <Input
                    type="time"
                    value={editingOverride.endTime}
                    onChange={(e) =>
                      setEditingOverride((prev) =>
                        prev ? { ...prev, endTime: e.target.value } : null,
                      )
                    }
                    className="w-24"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Icon icon={FloppyDiskIcon} className="mr-1.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
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

        {/* Overrides List */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <h4 className="text-sm font-medium mb-3">Upcoming Overrides</h4>
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No date overrides configured.
            </p>
          ) : (
            <div className="space-y-1.5">
              {overrides
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((override) => (
                  <div
                    key={override.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedDate(DateTime.fromISO(override.date));
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
                        {formatDisplayDate(override.date, timezone)}
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
        </div>
      </div>
    );
  }

  // Full layout: 2-column grid
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
                {formatDisplayDate(editingOverride.date, timezone)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Checkbox
                checked={editingOverride.isBlocked}
                onChange={(checked) =>
                  setEditingOverride((prev) =>
                    prev ? { ...prev, isBlocked: checked } : null,
                  )
                }
                label="Block entire day (no availability)"
              />

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
            {overrides.length === 0 ? (
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
                        setSelectedDate(DateTime.fromISO(override.date));
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
                          {formatDisplayDate(override.date, timezone)}
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
