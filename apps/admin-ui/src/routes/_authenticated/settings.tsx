// Settings page - Organization settings management

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SvixProvider,
  useEndpoints,
  useEventTypes,
  useMessages,
  useSvix,
} from "svix-react";
import { z } from "zod";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import {
  createApiKeySchema,
  createOrgUserSchema,
  type CreateApiKeyInput,
  type WebhookSessionResponse,
  updateOrgSettingsSchema,
  type CreateOrgUserInput,
  type OrgMembershipRole,
  type UpdateOrgSettingsInput,
  type UpdateOrgUserRoleInput,
} from "@scheduling/dto";

import { RowActions } from "@/components/row-actions";
import {
  EntityCardField,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { EntityModal } from "@/components/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Icon } from "@/components/ui/icon";
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

type SettingsTab = "organization" | "users" | "developers" | "webhooks";

const SETTINGS_TABS = [
  { id: "organization" as const, label: "Organization" },
  { id: "users" as const, label: "Users" },
  { id: "developers" as const, label: "Developers" },
  { id: "webhooks" as const, label: "Webhooks" },
] as const;

const COMING_SOON_TABS = [{ label: "Security" }, { label: "Audit" }] as const;

function resolveTab(raw: string | undefined): SettingsTab {
  if (
    raw === "organization" ||
    raw === "users" ||
    raw === "developers" ||
    raw === "webhooks"
  )
    return raw;
  if (raw === "general" || raw === "scheduling") return "organization";
  return "organization";
}

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

type OrgRoleFilter = "all" | OrgMembershipRole;

const isOrgRoleFilter = (
  value: string | null | undefined,
): value is OrgRoleFilter => value === "all" || isOrgMembershipRole(value);

type UserStatusFilter = "all" | "active" | "invited" | "suspended";

const USER_STATUS_OPTIONS: Array<{
  value: UserStatusFilter;
  label: string;
  disabled?: boolean;
}> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited (coming soon)", disabled: true },
  { value: "suspended", label: "Suspended (coming soon)", disabled: true },
];

const isUserStatusFilter = (
  value: string | null | undefined,
): value is UserStatusFilter =>
  typeof value === "string" &&
  USER_STATUS_OPTIONS.some((option) => option.value === value);

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

interface SettingsSearchParams {
  section?: string;
}

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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
  const navigate = useNavigate({ from: Route.fullPath });
  const { section } = Route.useSearch();
  const activeTab = resolveTab(section);
  const formRef = useRef<HTMLFormElement>(null);

  // Update settings mutation
  const updateMutation = useMutation(
    orpc.org.updateSettings.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.org.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to save settings");
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
      ? current.filter((existingDay) => existingDay !== day)
      : [...current, day].toSorted((a, b) => a - b);
    setValue("defaultBusinessDays", newDays, { shouldDirty: true });
  };

  const onSubmit = (data: UpdateOrgSettingsInput) => {
    updateMutation.mutate(data);
  };

  useSubmitShortcut({
    enabled:
      activeTab === "organization" && !updateMutation.isPending && isDirty,
    scope: "global",
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  const setActiveTab = (tab: SettingsTab) => {
    navigate({
      search: (prev) => ({
        ...prev,
        section: tab === "organization" ? undefined : tab,
      }),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure organization and application settings.
      </p>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-0.5"
      >
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "h-10 shrink-0 rounded-md px-3 text-sm font-medium transition-colors md:h-8",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
        {COMING_SOON_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            disabled
            aria-disabled="true"
            className="h-10 shrink-0 rounded-md px-3 text-sm font-medium text-muted-foreground/50 cursor-not-allowed md:h-8"
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] uppercase tracking-wide">
              Soon
            </span>
          </button>
        ))}
      </div>

      {activeTab === "organization" ? (
        <div id="settings-panel-organization" role="tabpanel" className="mt-6">
          <form ref={formRef} onSubmit={handleSubmit(onSubmit)}>
            <dl className="divide-y divide-border">
              {/* Default timezone */}
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                <div>
                  <dt className="text-sm font-medium">Default timezone</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    The default timezone used for new locations and calendars.
                  </dd>
                </div>
                <dd className="sm:justify-self-end">
                  <div className="w-full sm:w-64">
                    <Controller
                      name="defaultTimezone"
                      control={control}
                      render={({ field }) => {
                        const timezoneSelectLabel = resolveSelectValueLabel({
                          value: field.value,
                          options: TIMEZONES,
                          getOptionValue: (timezone) => timezone,
                          getOptionLabel: (timezone) => timezone,
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
                              {TIMEZONES.map((timezone) => (
                                <SelectItem key={timezone} value={timezone}>
                                  {timezone}
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
                </dd>
              </div>

              {/* Email notifications */}
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                <div>
                  <dt className="text-sm font-medium">Email notifications</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    Control email and notification preferences for the
                    organization.
                  </dd>
                </div>
                <dd className="sm:justify-self-end">
                  <Controller
                    name="notificationsEnabled"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value ?? true}
                        onChange={field.onChange}
                        label="Enable email notifications"
                      />
                    )}
                  />
                </dd>
              </div>

              {/* Default business hours */}
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                <div>
                  <dt className="text-sm font-medium">
                    Default business hours
                  </dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    The default working hours applied to new calendars.
                  </dd>
                </div>
                <dd className="sm:justify-self-end">
                  <div className="flex items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="startTime" className="text-xs">
                        Start
                      </Label>
                      <Controller
                        name="defaultBusinessHoursStart"
                        control={control}
                        render={({ field }) => (
                          <Input
                            id="startTime"
                            type="time"
                            className="w-28"
                            disabled={updateMutation.isPending}
                            {...field}
                          />
                        )}
                      />
                      {errors.defaultBusinessHoursStart && (
                        <p className="text-xs text-destructive">
                          {errors.defaultBusinessHoursStart.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="endTime" className="text-xs">
                        End
                      </Label>
                      <Controller
                        name="defaultBusinessHoursEnd"
                        control={control}
                        render={({ field }) => (
                          <Input
                            id="endTime"
                            type="time"
                            className="w-28"
                            disabled={updateMutation.isPending}
                            {...field}
                          />
                        )}
                      />
                      {errors.defaultBusinessHoursEnd && (
                        <p className="text-xs text-destructive">
                          {errors.defaultBusinessHoursEnd.message}
                        </p>
                      )}
                    </div>
                  </div>
                </dd>
              </div>

              {/* Business days */}
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                <div>
                  <dt className="text-sm font-medium">Business days</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    Select which days of the week your business operates.
                  </dd>
                </div>
                <dd className="sm:justify-self-end">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        disabled={updateMutation.isPending}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                          selectedDays.includes(day.value)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                        aria-pressed={selectedDays.includes(day.value)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  {errors.defaultBusinessDays && (
                    <p className="mt-2 text-sm text-destructive">
                      {errors.defaultBusinessDays.message}
                    </p>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-6 mt-2">
              {isDirty ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : null}
              <Button
                type="submit"
                disabled={updateMutation.isPending || !isDirty}
              >
                {updateMutation.isPending ? "Saving..." : "Save changes"}
                <ShortcutBadge
                  shortcut="meta+enter"
                  className="ml-2 hidden sm:inline-flex"
                />
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <div id="settings-panel-users" role="tabpanel" className="mt-6">
          <UsersManagementSection />
        </div>
      ) : null}

      {activeTab === "developers" ? (
        <div id="settings-panel-developers" role="tabpanel" className="mt-6">
          <ApiKeysSection />
        </div>
      ) : null}

      {activeTab === "webhooks" ? (
        <div id="settings-panel-webhooks" role="tabpanel" className="mt-6">
          <WebhooksSection />
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const {
    data: apiKeysResponse,
    isLoading,
    error,
  } = useQuery(orpc.apiKeys.list.queryOptions({}));

  const createApiKeyMutation = useMutation(
    orpc.apiKeys.create.mutationOptions({
      onSuccess: (createdKey) => {
        setRevealedKey(createdKey.key);
        queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create API key");
      },
    }),
  );

  const revokeApiKeyMutation = useMutation(
    orpc.apiKeys.revoke.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to revoke API key");
      },
    }),
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof createApiKeySchema>, unknown, CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: "",
      scope: "member",
      expiresAt: undefined,
    },
  });

  const onCreateApiKey = (input: CreateApiKeyInput) => {
    createApiKeyMutation.mutate(input, {
      onSuccess: () => {
        reset({
          name: "",
          scope: "member",
          expiresAt: undefined,
        });
      },
    });
  };

  const onRevokeApiKey = (id: string) => {
    setRevokingKeyId(id);
    revokeApiKeyMutation.mutate(
      { id },
      {
        onSettled: () => {
          setRevokingKeyId(null);
        },
      },
    );
  };

  const apiKeys = apiKeysResponse?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Create scoped API keys for machine-to-machine integrations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          onSubmit={handleSubmit(onCreateApiKey)}
          className="grid gap-4 rounded-xl bg-muted/30 p-4 md:grid-cols-[1.4fr_180px_220px_auto]"
        >
          <div className="space-y-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              placeholder="Production integration"
              disabled={createApiKeyMutation.isPending}
              {...register("name")}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key-scope">Scope</Label>
            <Controller
              name="scope"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (isOrgMembershipRole(value)) {
                      field.onChange(value);
                    }
                  }}
                  disabled={createApiKeyMutation.isPending}
                >
                  <SelectTrigger id="api-key-scope">
                    <SelectValue placeholder="Select scope" />
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
            {errors.scope ? (
              <p className="mt-1 text-xs text-destructive">
                {errors.scope.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key-expires-at">Expires at (optional)</Label>
            <Input
              id="api-key-expires-at"
              type="datetime-local"
              disabled={createApiKeyMutation.isPending}
              {...register("expiresAt", {
                setValueAs: (value) => {
                  if (typeof value !== "string") return value;
                  if (value.trim().length === 0) return undefined;
                  const parsed = new Date(value);
                  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
                },
              })}
            />
            {errors.expiresAt ? (
              <p className="mt-1 text-xs text-destructive">
                {errors.expiresAt.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={createApiKeyMutation.isPending}>
              {createApiKeyMutation.isPending ? "Creating..." : "Create key"}
            </Button>
          </div>
        </form>

        {revealedKey ? (
          <div className="rounded-xl bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">New API key (shown once)</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(revealedKey);
                    toast.success("API key copied");
                  } catch {
                    toast.error("Failed to copy API key");
                  }
                }}
              >
                Copy
              </Button>
            </div>
            <Input
              readOnly
              value={revealedKey}
              className="mt-3 font-mono text-xs"
              aria-label="Created API key"
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading API keys...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            Failed to load API keys.
          </div>
        ) : !apiKeys.length ? (
          <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No API keys yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell className="font-medium">
                      {apiKey.name?.trim() || "Untitled key"}
                    </TableCell>
                    <TableCell className="capitalize">{apiKey.scope}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {apiKey.prefix ?? "—"}
                    </TableCell>
                    <TableCell>{formatDateTime(apiKey.lastUsedAt)}</TableCell>
                    <TableCell>{formatDateTime(apiKey.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          revokeApiKeyMutation.isPending &&
                          revokingKeyId === apiKey.id
                        }
                        onClick={() => onRevokeApiKey(apiKey.id)}
                      >
                        {revokeApiKeyMutation.isPending &&
                        revokingKeyId === apiKey.id
                          ? "Revoking..."
                          : "Revoke"}
                      </Button>
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

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 60 * 60) return `${Math.floor(totalSeconds / 60)}m`;
  return `${Math.floor(totalSeconds / (60 * 60))}h`;
}

function normalizeWebhookUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function formatWebhookPayloadPreview(payload: unknown): string {
  if (typeof payload === "string") {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) return payload;

    try {
      return JSON.stringify(JSON.parse(trimmedPayload), null, 2);
    } catch {
      return payload;
    }
  }

  if (payload === undefined) return "";

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "[unserializable payload]";
  }
}

function WebhooksManager({
  webhookSession,
  onRefreshSession,
  isRefreshingSession,
}: {
  webhookSession: WebhookSessionResponse;
  onRefreshSession: () => void;
  isRefreshingSession: boolean;
}) {
  const { svix, appId } = useSvix();
  const endpoints = useEndpoints({ limit: 50 });
  const eventTypes = useEventTypes({ limit: 100 });
  const messages = useMessages({ limit: 25 });

  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newEndpointDescription, setNewEndpointDescription] = useState("");
  const [newEndpointEventTypes, setNewEndpointEventTypes] = useState<string[]>(
    [],
  );
  const [revealedSecret, setRevealedSecret] = useState<{
    endpointId: string;
    key: string;
  } | null>(null);
  const [selectedMessageForPreview, setSelectedMessageForPreview] = useState<{
    id: string;
    eventId: string;
    eventType: string;
  } | null>(null);

  const selectedMessage = useQuery({
    queryKey: [
      "settings",
      "webhooks",
      "message",
      selectedMessageForPreview?.id,
    ],
    queryFn: async () => {
      if (!selectedMessageForPreview) {
        throw new Error("Missing selected message");
      }
      return svix.message.get(appId, selectedMessageForPreview.id);
    },
    enabled: selectedMessageForPreview !== null,
  });

  const selectedMessagePayload = useMemo(() => {
    if (!selectedMessage.data) return "";
    return formatWebhookPayloadPreview(selectedMessage.data.payload);
  }, [selectedMessage.data]);

  const createEndpointMutation = useMutation({
    mutationFn: async (input: {
      url: string;
      description: string;
      eventTypes: string[];
    }) =>
      svix.endpoint.create(appId, {
        url: input.url,
        description: input.description || undefined,
        filterTypes: input.eventTypes.length ? input.eventTypes : null,
        metadata: {
          source: "admin-ui",
        },
      }),
    onSuccess: () => {
      setNewEndpointUrl("");
      setNewEndpointDescription("");
      setNewEndpointEventTypes([]);
      toast.success("Webhook endpoint created");
      endpoints.reload();
      messages.reload();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create endpoint");
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: async (endpointId: string) => {
      await svix.endpoint.delete(appId, endpointId);
      return endpointId;
    },
    onSuccess: (endpointId) => {
      if (revealedSecret?.endpointId === endpointId) {
        setRevealedSecret(null);
      }
      toast.success("Webhook endpoint deleted");
      endpoints.reload();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete endpoint");
    },
  });

  const revealSecretMutation = useMutation({
    mutationFn: async (endpointId: string) => {
      const secret = await svix.endpoint.getSecret(appId, endpointId);
      return { endpointId, key: secret.key };
    },
    onSuccess: (secret) => {
      setRevealedSecret(secret);
      toast.success("Signing secret loaded");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to load signing secret");
    },
  });

  const sortedEventTypes = useMemo(
    () =>
      (eventTypes.data ?? []).toSorted((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [eventTypes.data],
  );

  const onToggleEventType = (eventTypeName: string) => {
    setNewEndpointEventTypes((current) =>
      current.includes(eventTypeName)
        ? current.filter((value) => value !== eventTypeName)
        : [...current, eventTypeName],
    );
  };

  const onCreateEndpoint = () => {
    const normalizedUrl = normalizeWebhookUrl(newEndpointUrl);
    if (!normalizedUrl) {
      toast.error("Enter a valid http(s) URL");
      return;
    }

    createEndpointMutation.mutate({
      url: normalizedUrl,
      description: newEndpointDescription.trim(),
      eventTypes: newEndpointEventTypes,
    });
  };

  const onRefreshData = () => {
    endpoints.reload();
    eventTypes.reload();
    messages.reload();
  };

  const onCopyPayload = async () => {
    if (!selectedMessagePayload) {
      toast.error("No payload available");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedMessagePayload);
      toast.success("Payload copied");
    } catch {
      toast.error("Failed to copy payload");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">App ID: {webhookSession.appId}</Badge>
          <Badge variant="outline">
            Session TTL:{" "}
            {formatDurationSeconds(webhookSession.expiresInSeconds)}
          </Badge>
          {webhookSession.serverUrl ? (
            <Badge variant="outline">Svix: {webhookSession.serverUrl}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefreshData}
          >
            Refresh data
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRefreshingSession}
            onClick={onRefreshSession}
          >
            {isRefreshingSession ? "Refreshing..." : "Refresh session"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Create Endpoint
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Register a destination URL and choose which event types it receives.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="webhook-endpoint-url">Endpoint URL</Label>
            <Input
              id="webhook-endpoint-url"
              type="url"
              value={newEndpointUrl}
              onChange={(event) => {
                setNewEndpointUrl(event.target.value);
              }}
              placeholder="https://example.com/webhooks/scheduling"
              disabled={createEndpointMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-endpoint-description">
              Description (optional)
            </Label>
            <Input
              id="webhook-endpoint-description"
              value={newEndpointDescription}
              onChange={(event) => {
                setNewEndpointDescription(event.target.value);
              }}
              placeholder="Production endpoint"
              disabled={createEndpointMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Event filters</Label>
          {eventTypes.loading ? (
            <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              Loading event catalog...
            </div>
          ) : eventTypes.error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load event catalog.
            </div>
          ) : !sortedEventTypes.length ? (
            <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              No event types found. Run the Svix catalog sync script first.
            </div>
          ) : (
            <div className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedEventTypes.map((eventType) => (
                <label
                  key={eventType.name}
                  className="flex items-start gap-2 rounded-md bg-background px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={newEndpointEventTypes.includes(eventType.name)}
                    onChange={() => {
                      onToggleEventType(eventType.name);
                    }}
                    disabled={createEndpointMutation.isPending}
                  />
                  <span className="font-mono text-xs">{eventType.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={createEndpointMutation.isPending}
            onClick={onCreateEndpoint}
          >
            {createEndpointMutation.isPending
              ? "Creating..."
              : "Create endpoint"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Endpoints</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Active webhook destinations for this organization.
          </p>
        </div>
        {endpoints.loading ? (
          <div className="text-sm text-muted-foreground">
            Loading endpoints...
          </div>
        ) : endpoints.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load endpoints.
          </div>
        ) : !endpoints.data?.length ? (
          <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No webhook endpoints yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.data.map((endpoint) => {
                  const endpointEventTypes = endpoint.filterTypes ?? [];
                  const endpointDisabled = endpoint.disabled ?? false;
                  const isDeleting =
                    deleteEndpointMutation.isPending &&
                    deleteEndpointMutation.variables === endpoint.id;
                  const isRevealingSecret =
                    revealSecretMutation.isPending &&
                    revealSecretMutation.variables === endpoint.id;

                  return (
                    <TableRow key={endpoint.id}>
                      <TableCell className="max-w-[320px]">
                        <div className="truncate font-medium">
                          {endpoint.url}
                        </div>
                        {endpoint.description ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {endpoint.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {endpointEventTypes.length ? (
                          <span className="text-sm">
                            {endpointEventTypes.length} selected
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            All events
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={endpointDisabled ? "secondary" : "success"}
                        >
                          {endpointDisabled ? "Disabled" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(endpoint.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isRevealingSecret}
                            onClick={() => {
                              revealSecretMutation.mutate(endpoint.id);
                            }}
                          >
                            {isRevealingSecret ? "Loading..." : "Show secret"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isDeleting}
                            onClick={() => {
                              deleteEndpointMutation.mutate(endpoint.id);
                            }}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {revealedSecret ? (
          <div className="rounded-xl bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Signing secret for endpoint {revealedSecret.endpointId}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(revealedSecret.key);
                    toast.success("Signing secret copied");
                  } catch {
                    toast.error("Failed to copy signing secret");
                  }
                }}
              >
                Copy
              </Button>
            </div>
            <Input
              readOnly
              value={revealedSecret.key}
              className="mt-3 font-mono text-xs"
              aria-label="Endpoint signing secret"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Recent Events
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest messages accepted by Svix for this organization.
          </p>
        </div>
        {messages.loading ? (
          <div className="text-sm text-muted-foreground">Loading events...</div>
        ) : messages.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load events.
          </div>
        ) : !messages.data?.length ? (
          <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No events published yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.data.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-mono text-xs">
                      {message.eventType}
                    </TableCell>
                    <TableCell>{formatDateTime(message.timestamp)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {message.eventId ?? message.id}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedMessageForPreview({
                            id: message.id,
                            eventId: message.eventId ?? message.id,
                            eventType: message.eventType,
                          });
                        }}
                      >
                        View payload
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EntityModal
        open={selectedMessageForPreview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMessageForPreview(null);
          }
        }}
        title={selectedMessageForPreview?.eventType ?? "Event payload"}
        description={
          selectedMessageForPreview
            ? `Event ID: ${selectedMessageForPreview.eventId}`
            : undefined
        }
        headerActions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedMessagePayload}
            onClick={onCopyPayload}
          >
            Copy payload
          </Button>
        }
      >
        {selectedMessage.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">
            Loading payload...
          </div>
        ) : selectedMessage.error ? (
          <div className="p-6">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load event payload.
            </div>
          </div>
        ) : !selectedMessagePayload ? (
          <div className="p-6 text-sm text-muted-foreground">
            This event has no payload content.
          </div>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-muted/30 p-4 font-mono text-xs leading-relaxed">
            {selectedMessagePayload}
          </pre>
        )}
      </EntityModal>
    </div>
  );
}

function WebhooksSection() {
  const {
    data: webhookSession,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery(orpc.webhooks.session.queryOptions({}));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
        <CardDescription>
          Manage webhook endpoints and recent deliveries with Svix.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="rounded-xl bg-muted/30 p-6 text-sm text-muted-foreground">
            Loading webhook manager...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load webhook management session.
          </div>
        ) : !webhookSession ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Missing webhook session.
          </div>
        ) : (
          <SvixProvider
            token={webhookSession.token}
            appId={webhookSession.appId}
            options={
              webhookSession.serverUrl
                ? { serverUrl: webhookSession.serverUrl }
                : undefined
            }
          >
            <WebhooksManager
              webhookSession={webhookSession}
              isRefreshingSession={isFetching}
              onRefreshSession={() => {
                void refetch();
              }}
            />
          </SvixProvider>
        )}
      </CardContent>
    </Card>
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
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getUserDisplayName(user: Pick<OrgUserListItem, "name" | "email">) {
  const trimmedName = user.name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : user.email;
}

function getUserInitials(user: Pick<OrgUserListItem, "name" | "email">) {
  const source = user.name?.trim() || user.email.split("@")[0] || "U";
  const parts = source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const [firstPart = "", secondPart = ""] = parts;
  if (!firstPart) return "U";
  if (!secondPart) return firstPart.slice(0, 2).toUpperCase();

  const firstInitial = firstPart[0] ?? "";
  const secondInitial = secondPart[0] ?? "";
  return `${firstInitial}${secondInitial}`.toUpperCase();
}

export function resetPaginationToFirstPage(
  pagination: PaginationState,
): PaginationState {
  if (pagination.pageIndex === 0) return pagination;
  return {
    ...pagination,
    pageIndex: 0,
  };
}

function UsersManagementSection() {
  const queryClient = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<OrgRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const {
    data: users,
    isLoading,
    error,
  } = useQuery(orpc.org.users.list.queryOptions({}));

  const createUserMutation = useMutation(
    orpc.org.users.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.org.users.key() });
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
          setIsCreateFormOpen(false);
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

  const roleCounts = useMemo(
    () => ({
      owner: orgUsers.filter((user) => user.role === "owner").length,
      admin: orgUsers.filter((user) => user.role === "admin").length,
      member: orgUsers.filter((user) => user.role === "member").length,
    }),
    [orgUsers],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orgUsers.filter((user) => {
      const displayName = user.name?.toLowerCase() ?? "";
      const matchesQuery =
        query.length === 0 ||
        displayName.includes(query) ||
        user.email.toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || statusFilter === "active";
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [orgUsers, searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    setPagination((previousPagination) =>
      resetPaginationToFirstPage(previousPagination),
    );
  }, [searchQuery, roleFilter, statusFilter]);

  const columns = useMemo<ColumnDef<OrgUserListItem>[]>(
    () => [
      {
        id: "member",
        accessorFn: (row) => getUserDisplayName(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Member" />
        ),
        cell: ({ row }) => {
          const user = row.original;
          const displayName = getUserDisplayName(user);
          return (
            <div className="flex items-center gap-3">
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="size-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold uppercase text-muted-foreground">
                  {getUserInitials(user)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        accessorKey: "role",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => (
          <Select
            value={row.original.role}
            onValueChange={(nextRole) => {
              if (!isOrgMembershipRole(nextRole)) return;
              if (nextRole === row.original.role) return;
              onChangeRole({
                userId: row.original.userId,
                role: nextRole,
              });
            }}
            disabled={
              updateRoleMutation.isPending &&
              updatingUserId === row.original.userId
            }
          >
            <SelectTrigger className="w-[130px]">
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
        ),
      },
      {
        id: "status",
        accessorFn: () => "active",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: () => <Badge variant="success">Active</Badge>,
      },
      {
        id: "joined",
        accessorFn: (row) => new Date(row.membershipCreatedAt).getTime(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Joined" />
        ),
        cell: ({ row }) => formatDate(row.original.membershipCreatedAt),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const displayName = getUserDisplayName(row.original);
          return (
            <RowActions
              ariaLabel={`Actions for ${displayName}`}
              actions={[
                {
                  label: "View profile (Coming soon)",
                  onClick: () => {},
                  disabled: true,
                },
                {
                  label: "Suspend user (Coming soon)",
                  onClick: () => {},
                  disabled: true,
                  separator: true,
                },
                {
                  label: "Remove from organization (Coming soon)",
                  onClick: () => {},
                  variant: "destructive",
                  disabled: true,
                },
              ]}
            />
          );
        },
      },
    ],
    [onChangeRole, updateRoleMutation.isPending, updatingUserId],
  );

  const usersTable = useReactTable({
    data: filteredUsers,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage organization members and role access. Invite emails are coming
          next.
        </p>
        {!isLoading && !error ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{orgUsers.length} members</Badge>
            <Badge variant="outline">{roleCounts.owner} owners</Badge>
            <Badge variant="outline">{roleCounts.admin} admins</Badge>
            <Badge variant="outline">{roleCounts.member} members</Badge>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Icon
              icon={Search01Icon}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
            />
          </div>

          <Select
            value={roleFilter}
            onValueChange={(value) => {
              if (isOrgRoleFilter(value)) {
                setRoleFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ORG_ROLE_OPTIONS.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (isUserStatusFilter(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {USER_STATUS_OPTIONS.map((status) => (
                <SelectItem
                  key={status.value}
                  value={status.value}
                  disabled={status.disabled}
                >
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          onClick={() => setIsCreateFormOpen((previousState) => !previousState)}
          variant={isCreateFormOpen ? "outline" : "default"}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          {isCreateFormOpen ? "Close" : "Add user"}
        </Button>
      </div>

      {isCreateFormOpen ? (
        <div className="rounded-xl bg-muted/30 p-4">
          <h3 className="text-sm font-semibold tracking-tight">Add user</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a user directly to this organization. Invite email delivery will
            be introduced in a follow-up release.
          </p>

          <form
            onSubmit={handleSubmit(onCreateUser)}
            className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="new.user@example.com"
                disabled={createUserMutation.isPending}
                {...register("email")}
              />
              {errors.email ? (
                <p className="mt-1 text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-name">Name (optional)</Label>
              <Input
                id="new-user-name"
                placeholder="Full name"
                disabled={createUserMutation.isPending}
                {...register("name", {
                  setValueAs: (value) => {
                    if (typeof value !== "string") return value;
                    const trimmedValue = value.trim();
                    return trimmedValue.length > 0 ? trimmedValue : undefined;
                  },
                })}
              />
              {errors.name ? (
                <p className="mt-1 text-xs text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
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
              {errors.role ? (
                <p className="mt-1 text-xs text-destructive">
                  {errors.role.message}
                </p>
              ) : null}
            </div>

            <div className="flex items-end">
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create user"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

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
        <div className="rounded-xl bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No users in this organization yet.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setIsCreateFormOpen(true)}
          >
            Add first user
          </Button>
        </div>
      ) : !filteredUsers.length ? (
        <div className="rounded-xl bg-muted/30 p-6">
          <p className="text-sm text-muted-foreground">
            No users match the current filters.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSearchQuery("");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <EntityMobileCardList>
            {usersTable.getRowModel().rows.map((row) => {
              const user = row.original;
              const displayName = getUserDisplayName(user);
              return (
                <EntityMobileCard key={user.membershipId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt=""
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold uppercase text-muted-foreground">
                          {getUserInitials(user)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {displayName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </div>
                    <RowActions
                      ariaLabel={`Actions for ${displayName}`}
                      actions={[
                        {
                          label: "View profile (Coming soon)",
                          onClick: () => {},
                          disabled: true,
                        },
                        {
                          label: "Suspend user (Coming soon)",
                          onClick: () => {},
                          disabled: true,
                          separator: true,
                        },
                        {
                          label: "Remove from organization (Coming soon)",
                          onClick: () => {},
                          variant: "destructive",
                          disabled: true,
                        },
                      ]}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Role
                      </Label>
                      <Select
                        value={user.role}
                        onValueChange={(nextRole) => {
                          if (!isOrgMembershipRole(nextRole)) return;
                          if (nextRole === user.role) return;
                          onChangeRole({
                            userId: user.userId,
                            role: nextRole,
                          });
                        }}
                        disabled={
                          updateRoleMutation.isPending &&
                          updatingUserId === user.userId
                        }
                      >
                        <SelectTrigger className="w-full">
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
                    </div>

                    <dl className="grid grid-cols-2 gap-3">
                      <EntityCardField
                        label="Status"
                        value={<Badge variant="success">Active</Badge>}
                      />
                      <EntityCardField
                        label="Joined"
                        value={formatDate(user.membershipCreatedAt)}
                      />
                    </dl>
                  </div>
                </EntityMobileCard>
              );
            })}
          </EntityMobileCardList>

          <DataTablePagination
            table={usersTable}
            className="justify-center rounded-xl border border-border bg-card shadow-sm md:hidden"
          />

          <div className="hidden overflow-hidden rounded-xl border border-border/50 md:block">
            <Table>
              <TableHeader>
                {usersTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          header.id === "actions"
                            ? "w-14 text-right"
                            : undefined
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {usersTable.getRowModel().rows.length > 0 ? (
                  usersTable.getRowModel().rows.map((row) => (
                    <TableRow key={row.original.membershipId}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            cell.column.id === "actions"
                              ? "text-right"
                              : undefined
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No users match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <DataTablePagination table={usersTable} />
          </div>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearchParams => {
    const section =
      typeof search.section === "string" ? search.section : undefined;
    return { section };
  },
  component: SettingsPage,
});
