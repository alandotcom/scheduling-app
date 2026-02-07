// Settings page - Organization settings management

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { updateOrgSettingsSchema } from "@scheduling/dto";
import type { UpdateOrgSettingsInput } from "@scheduling/dto";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

// Org settings type inferred from API response
interface OrgSettings {
  id: string;
  name: string;
  defaultTimezone: string | null;
  defaultBusinessHoursStart: string | null;
  defaultBusinessHoursEnd: string | null;
  defaultBusinessDays: number[] | null;
  notificationsEnabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

function SettingsPage() {
  // Fetch current org settings
  const {
    data: org,
    isLoading,
    error,
  } = useQuery(orpc.org.get.queryOptions({}));

  // Show loading state while fetching
  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure organization and application settings.
        </p>
        <div
          className="mt-10 text-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure organization and application settings.
        </p>
        <div className="mt-10 text-center text-destructive">
          Error loading settings
        </div>
      </div>
    );
  }

  // Render form only when data is available
  return <SettingsForm org={org as OrgSettings} />;
}

interface SettingsFormProps {
  org: OrgSettings;
}

function SettingsForm({ org }: SettingsFormProps) {
  const queryClient = useQueryClient();

  // Update settings mutation
  const updateMutation = useMutation(
    orpc.org.updateSettings.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.org.key() });
        toast.success("Settings saved successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save settings");
      },
    }),
  );

  // Parse business days - handle both array and string formats from DB
  const parseBusinessDays = (days: unknown): number[] => {
    if (Array.isArray(days)) return days;
    if (typeof days === "string") {
      try {
        const parsed = JSON.parse(days);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore parse errors
      }
    }
    return [1, 2, 3, 4, 5];
  };

  // Form setup with defaults from fetched org data
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdateOrgSettingsInput>({
    resolver: zodResolver(updateOrgSettingsSchema),
    defaultValues: {
      defaultTimezone: org.defaultTimezone ?? "America/New_York",
      defaultBusinessHoursStart: org.defaultBusinessHoursStart ?? "09:00",
      defaultBusinessHoursEnd: org.defaultBusinessHoursEnd ?? "17:00",
      defaultBusinessDays: parseBusinessDays(org.defaultBusinessDays),
      notificationsEnabled: org.notificationsEnabled ?? true,
    },
  });

  const selectedDays = watch("defaultBusinessDays") ?? [1, 2, 3, 4, 5];

  const toggleDay = (day: number) => {
    const current = selectedDays;
    const newDays = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setValue("defaultBusinessDays", newDays, { shouldDirty: true });
  };

  const onSubmit = (data: UpdateOrgSettingsInput) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure organization and application settings.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 flex flex-col gap-6"
      >
        {/* Timezone Section */}
        <Card>
          <CardHeader>
            <CardTitle>Default Timezone</CardTitle>
            <CardDescription>
              The default timezone used for new locations and calendars.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <Label htmlFor="timezone" className="sr-only">
                Timezone
              </Label>
              <Controller
                name="defaultTimezone"
                control={control}
                render={({ field }) => {
                  const timezoneSelectLabel = resolveSelectValueLabel({
                    value: field.value,
                    options: TIMEZONES,
                    getOptionValue: (tz) => tz,
                    getOptionLabel: (tz) => tz,
                    unknownLabel: "Unknown timezone",
                  });

                  return (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone">
                          {timezoneSelectLabel}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
              {errors.defaultTimezone && (
                <p className="mt-2 text-sm text-destructive">
                  {errors.defaultTimezone.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Business Hours Section */}
        <Card>
          <CardHeader>
            <CardTitle>Default Business Hours</CardTitle>
            <CardDescription>
              The default working hours applied to new calendars.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Controller
                  name="defaultBusinessHoursStart"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="startTime"
                      type="time"
                      className="w-32"
                      disabled={updateMutation.isPending}
                      {...field}
                    />
                  )}
                />
                {errors.defaultBusinessHoursStart && (
                  <p className="text-sm text-destructive">
                    {errors.defaultBusinessHoursStart.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Controller
                  name="defaultBusinessHoursEnd"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="endTime"
                      type="time"
                      className="w-32"
                      disabled={updateMutation.isPending}
                      {...field}
                    />
                  )}
                />
                {errors.defaultBusinessHoursEnd && (
                  <p className="text-sm text-destructive">
                    {errors.defaultBusinessHoursEnd.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Business Days</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    disabled={updateMutation.isPending}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      selectedDays.includes(day.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    aria-pressed={selectedDays.includes(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {errors.defaultBusinessDays && (
                <p className="text-sm text-destructive">
                  {errors.defaultBusinessDays.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notifications Section */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Control email and notification preferences for the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="notificationsEnabled"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value ?? true}
                  onChange={field.onChange}
                  label="Enable email notifications for appointments"
                />
              )}
            />
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
