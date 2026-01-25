// Calendar availability editor - manage weekly hours and overrides

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
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

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface WeeklyRule {
  weekday: number;
  startTime: string;
  endTime: string;
  intervalMin?: number | null;
}

function AvailabilityPage() {
  const { calendarId } = Route.useParams();
  const queryClient = useQueryClient();

  const [weeklyRules, setWeeklyRules] = useState<WeeklyRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch calendar details
  const { data: calendar, isLoading: calendarLoading } = useQuery(
    orpc.calendars.get.queryOptions({
      input: { id: calendarId },
    }),
  );

  // Fetch availability rules
  const { isLoading: rulesLoading } = useQuery({
    ...orpc.availability.rules.list.queryOptions({
      input: { calendarId, limit: 100 },
    }),
    select: (data) => {
      // Initialize form state with fetched data
      if (data?.items && !hasChanges) {
        const rules = data.items.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          intervalMin: r.intervalMin,
        }));
        setWeeklyRules(rules);
      }
      return data;
    },
  });

  // Set weekly availability mutation
  const setWeeklyMutation = useMutation(
    orpc.availability.rules.setWeekly.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.availability.key() });
        setHasChanges(false);
      },
    }),
  );

  const isLoading = calendarLoading || rulesLoading;

  const addRule = () => {
    setWeeklyRules((prev) => [
      ...prev,
      { weekday: 1, startTime: "09:00", endTime: "17:00", intervalMin: null },
    ]);
    setHasChanges(true);
  };

  const updateRule = (index: number, updates: Partial<WeeklyRule>) => {
    setWeeklyRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...updates } : rule)),
    );
    setHasChanges(true);
  };

  const removeRule = (index: number) => {
    setWeeklyRules((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSave = () => {
    setWeeklyMutation.mutate({
      calendarId,
      rules: weeklyRules.map((r) => ({
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        intervalMin: r.intervalMin ?? undefined,
      })),
    });
  };

  return (
    <div className="p-8">
      <Breadcrumb
        items={[
          { label: "Calendars", to: "/calendars" },
          { label: calendar?.name ?? "..." },
          { label: "Availability" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {calendar?.name ?? "Calendar"} - Availability
          </h1>
          <p className="mt-1 text-muted-foreground">
            Configure weekly availability hours for this calendar.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || setWeeklyMutation.isPending}
        >
          <Icon icon={FloppyDiskIcon} className="mr-2" />
          {setWeeklyMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Separator className="my-6" />

      {isLoading ? (
        <div className="text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Weekly Hours */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Weekly Hours</CardTitle>
              <Button size="sm" onClick={addRule}>
                <Icon icon={Add01Icon} className="mr-2" />
                Add Time Block
              </Button>
            </CardHeader>
            <CardContent>
              {weeklyRules.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No availability configured. Add time blocks to set when this
                  calendar is available.
                </p>
              ) : (
                <div className="space-y-4">
                  {weeklyRules.map((rule, index) => (
                    <div
                      key={index}
                      className="flex items-end gap-4 rounded-lg border p-4"
                    >
                      <div className="flex-1 space-y-2">
                        <Label>Day</Label>
                        <Select
                          value={String(rule.weekday)}
                          onValueChange={(value) =>
                            value &&
                            updateRule(index, { weekday: parseInt(value, 10) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((day) => (
                              <SelectItem
                                key={day.value}
                                value={String(day.value)}
                              >
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 space-y-2">
                        <Label>Start</Label>
                        <Input
                          type="time"
                          value={rule.startTime}
                          onChange={(e) =>
                            updateRule(index, { startTime: e.target.value })
                          }
                        />
                      </div>
                      <div className="w-32 space-y-2">
                        <Label>End</Label>
                        <Input
                          type="time"
                          value={rule.endTime}
                          onChange={(e) =>
                            updateRule(index, { endTime: e.target.value })
                          }
                        />
                      </div>
                      <div className="w-28 space-y-2">
                        <Label>Interval (min)</Label>
                        <Input
                          type="number"
                          min={5}
                          step={5}
                          placeholder="Auto"
                          value={rule.intervalMin ?? ""}
                          onChange={(e) =>
                            updateRule(index, {
                              intervalMin: e.target.value
                                ? parseInt(e.target.value, 10)
                                : null,
                            })
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(index)}
                      >
                        <Icon icon={Delete01Icon} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {weeklyRules.length === 0 ? (
                <p className="text-muted-foreground">
                  No availability configured.
                </p>
              ) : (
                <div className="space-y-2">
                  {WEEKDAYS.map((day) => {
                    const dayRules = weeklyRules.filter(
                      (r) => r.weekday === day.value,
                    );
                    return (
                      <div key={day.value} className="flex gap-4">
                        <span className="w-24 font-medium">{day.label}</span>
                        {dayRules.length === 0 ? (
                          <span className="text-muted-foreground">Closed</span>
                        ) : (
                          <span>
                            {dayRules
                              .map((r) => `${r.startTime} - ${r.endTime}`)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute(
  "/_authenticated/calendars/$calendarId/availability",
)({
  component: AvailabilityPage,
});
