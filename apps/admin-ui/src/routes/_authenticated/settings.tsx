// Settings page - Organization settings management

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRef, useState } from "react";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import {
  createOrgUserSchema,
  updateOrgSettingsSchema,
  type CreateOrgUserInput,
  type OrgMembershipRole,
  type UpdateOrgSettingsInput,
  type UpdateOrgUserRoleInput,
} from "@scheduling/dto";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

const ORG_ROLE_OPTIONS: Array<{ value: OrgMembershipRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];
const isOrgMembershipRole = (
  value: string | null | undefined,
): value is OrgMembershipRole =>
  typeof value === "string" &&
  ORG_ROLE_OPTIONS.some((role) => role.value === value);

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

  if (!org) {
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
  return <SettingsForm org={org} />;
}

interface SettingsFormProps {
  org: OrgSettings;
}

function SettingsForm({ org }: SettingsFormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

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
      : [...current, day].toSorted((a, b) => a - b);
    setValue("defaultBusinessDays", newDays, { shouldDirty: true });
  };

  const onSubmit = (data: UpdateOrgSettingsInput) => {
    updateMutation.mutate(data);
  };

  useSubmitShortcut({
    enabled: !updateMutation.isPending && isDirty,
    scope: "global",
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure organization and application settings.
      </p>

      <form
        ref={formRef}
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
            <ShortcutBadge
              shortcut="meta+enter"
              className="ml-2 hidden sm:inline-flex"
            />
          </Button>
        </div>
      </form>

      <UsersManagementSection />
    </div>
  );
}

interface OrgUserListItem {
  membershipId: string;
  orgId: string;
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: OrgMembershipRole;
  membershipCreatedAt: Date;
  membershipUpdatedAt: Date;
  userCreatedAt: Date;
  userUpdatedAt: Date;
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString();
}

function UsersManagementSection() {
  const queryClient = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const {
    data: users,
    isLoading,
    error,
  } = useQuery(orpc.org.users.list.queryOptions({}));

  const createUserMutation = useMutation(
    orpc.org.users.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.org.users.key() });
        toast.success("User created");
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create user");
      },
    }),
  );

  const updateRoleMutation = useMutation(
    orpc.org.users.updateRole.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.org.users.key() });
        toast.success("User role updated");
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update role");
      },
    }),
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateOrgUserInput>({
    resolver: zodResolver(createOrgUserSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "member",
    },
  });

  const onCreateUser = (data: CreateOrgUserInput) => {
    createUserMutation.mutate(
      {
        email: data.email.trim().toLowerCase(),
        name: data.name?.trim() || undefined,
        role: data.role,
      },
      {
        onSuccess: () => {
          reset({
            email: "",
            name: "",
            role: "member",
          });
        },
      },
    );
  };

  const onChangeRole = (input: UpdateOrgUserRoleInput) => {
    setUpdatingUserId(input.userId);
    updateRoleMutation.mutate(input, {
      onSettled: () => {
        setUpdatingUserId(null);
      },
    });
  };

  const orgUsers = (users ?? []) as OrgUserListItem[];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Manage organization members and roles. Invite emails are coming next.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={handleSubmit(onCreateUser)}
          className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
        >
          <div>
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              placeholder="new.user@example.com"
              disabled={createUserMutation.isPending}
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="new-user-name">Name (optional)</Label>
            <Input
              id="new-user-name"
              placeholder="Full name"
              disabled={createUserMutation.isPending}
              {...register("name", {
                setValueAs: (value) => {
                  if (typeof value !== "string") return value;
                  const trimmed = value.trim();
                  return trimmed.length > 0 ? trimmed : undefined;
                },
              })}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="new-user-role">Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (isOrgMembershipRole(value)) {
                      field.onChange(value);
                    }
                  }}
                  disabled={createUserMutation.isPending}
                >
                  <SelectTrigger id="new-user-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && (
              <p className="mt-1 text-xs text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? "Creating..." : "Add user"}
            </Button>
          </div>
        </form>

        {isLoading ? (
          <div
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Loading users...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Failed to load users.</div>
        ) : !orgUsers.length ? (
          <div className="text-sm text-muted-foreground">
            No users in this organization yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgUsers.map((user) => (
                  <TableRow key={user.membershipId}>
                    <TableCell>{user.name || "—"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(nextRole) => {
                          if (!isOrgMembershipRole(nextRole)) return;
                          const role = nextRole;
                          if (role === user.role) return;
                          onChangeRole({ userId: user.userId, role });
                        }}
                        disabled={
                          updateRoleMutation.isPending &&
                          updatingUserId === user.userId
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORG_ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {formatDate(user.membershipCreatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
