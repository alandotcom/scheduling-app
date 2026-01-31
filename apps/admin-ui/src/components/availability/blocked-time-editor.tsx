// Blocked time editor - self-contained component for managing blocked time periods

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECURRENCE_OPTIONS } from "./constants";
import {
  formatDate,
  formatTime,
  formatDisplayDateTime,
  rruleToLabel,
  recurrenceToRrule,
  rruleToRecurrence,
} from "./utils";

interface BlockedTimeEditorProps {
  calendarId: string;
  compact?: boolean;
}

export function BlockedTimeEditor({
  calendarId,
  compact = false,
}: BlockedTimeEditorProps) {
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
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <h4 className="text-sm font-medium">
              {editingBlock.id ? "Edit Block" : "Add Blocked Time"}
            </h4>

            {/* Start Date/Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
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
                <Label className="text-xs">Start Time</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
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
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
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
            <div className="space-y-1">
              <Label className="text-xs">Repeats</Label>
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
        <div className="rounded-lg border border-border/50 bg-card p-4">
          {blockedTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No blocked time configured.
            </p>
          ) : (
            <div className="space-y-2">
              {blockedTimes
                .sort(
                  (a, b) =>
                    new Date(a.startAt).getTime() -
                    new Date(b.startAt).getTime(),
                )
                .map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between p-2 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer text-sm"
                    onClick={() => handleEdit(block)}
                  >
                    <div>
                      <div className="font-medium">
                        {formatDisplayDateTime(block.startAt)} -{" "}
                        {formatDisplayDateTime(block.endAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {rruleToLabel(block.recurringRule)}
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
          {blockedTimes.length === 0 ? (
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
