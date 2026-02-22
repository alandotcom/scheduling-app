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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { authClient } from "@/lib/auth-client";
import { TIMEZONES } from "@/lib/constants";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import {
  createApiKeySchema,
  createOrgUserSchema,
  type CreateApiKeyInput,
  updateOrgSettingsSchema,
  type CreateOrgUserInput,
  type OrgMembershipRole,
  type UpdateOrgSettingsInput,
  type UpdateOrgUserRoleInput,
} from "@scheduling/dto";

import { WebhooksSection } from "@/components/settings/webhooks/webhooks-section";
import { IntegrationsSection } from "@/components/settings/integrations/integrations-section";
import { CustomFieldsSection } from "@/components/settings/custom-fields/custom-fields-section";
import type {
  AttemptFilter,
  WebhookTab,
  WebhooksRouteState,
} from "@/components/settings/webhooks/types";
import { PageScaffold } from "@/components/layout/page-scaffold";
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
import { Skeleton } from "@/components/ui/skeleton";
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

type SettingsTab =
  | "organization"
  | "users"
  | "custom-fields"
  | "developers"
  | "integrations"
  | "webhooks";

function resolveTab(raw: string | undefined): SettingsTab {
  if (
    raw === "organization" ||
    raw === "users" ||
    raw === "custom-fields" ||
    raw === "developers" ||
    raw === "integrations" ||
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

const API_KEY_PERMISSION_OPTIONS = [
  { value: "all", label: "All permissions" },
  ...ORG_ROLE_OPTIONS,
] as const;

const ORG_ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All roles" },
  ...ORG_ROLE_OPTIONS,
] as const;

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

export function getOrgRoleLabel(
  value: string | null | undefined,
  unknownLabel = "Unknown role",
): string | undefined {
  return resolveSelectValueLabel({
    value,
    options: ORG_ROLE_OPTIONS,
    getOptionValue: (option) => option.value,
    getOptionLabel: (option) => option.label,
    unknownLabel,
  });
}

export function getApiKeyPermissionFilterLabel(
  value: string | null | undefined,
): string | undefined {
  return resolveSelectValueLabel({
    value,
    options: API_KEY_PERMISSION_OPTIONS,
    getOptionValue: (option) => option.value,
    getOptionLabel: (option) => option.label,
  });
}

export function getOrgRoleFilterLabel(
  value: string | null | undefined,
): string | undefined {
  return resolveSelectValueLabel({
    value,
    options: ORG_ROLE_FILTER_OPTIONS,
    getOptionValue: (option) => option.value,
    getOptionLabel: (option) => option.label,
  });
}

export function getUserStatusFilterLabel(
  value: string | null | undefined,
): string | undefined {
  return resolveSelectValueLabel({
    value,
    options: USER_STATUS_OPTIONS,
    getOptionValue: (option) => option.value,
    getOptionLabel: (option) => option.label,
  });
}

type ApiKeyPermissionFilter = "all" | OrgMembershipRole;

const isApiKeyPermissionFilter = (
  value: string | null | undefined,
): value is ApiKeyPermissionFilter =>
  value === "all" || isOrgMembershipRole(value);

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

function canManageOrgSettingsForRole(
  role: "owner" | "admin" | "member" | null,
): boolean {
  return role === "owner" || role === "admin";
}

interface SettingsSearchParams {
  section?: string;
  webhookTab?: string;
  endpointId?: string;
  messageId?: string;
  attemptFilter?: string;
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
  const { section, webhookTab, endpointId, messageId, attemptFilter } =
    Route.useSearch();
  const activeTab = resolveTab(section);
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: session } = authClient.useSession();
  const activeOrganizationId = session?.session.activeOrganizationId ?? null;
  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });
  const membershipsQuery = useQuery({
    ...orpc.org.listMemberships.queryOptions({}),
    enabled: authContextQuery.isError && !!activeOrganizationId,
  });
  const fallbackRole =
    membershipsQuery.data?.find(
      (membership) => membership.orgId === activeOrganizationId,
    )?.role ?? null;
  const activeOrganizationRole = authContextQuery.data?.role ?? fallbackRole;
  const canManageOrgSettings = canManageOrgSettingsForRole(
    activeOrganizationRole,
  );
  const isLoadingPermissions =
    authContextQuery.isLoading ||
    (authContextQuery.isError && membershipsQuery.isLoading);

  const webhookRouteState: WebhooksRouteState = useMemo(
    () => ({ webhookTab, endpointId, messageId, attemptFilter }),
    [webhookTab, endpointId, messageId, attemptFilter],
  );

  const goToEndpoints = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        webhookTab: undefined,
        endpointId: undefined,
        messageId: undefined,
        attemptFilter: undefined,
      }),
    });
  }, [navigate]);

  const goToEndpoint = useCallback(
    (nextEndpointId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          endpointId: nextEndpointId || undefined,
          messageId: undefined,
          attemptFilter: undefined,
        }),
      });
    },
    [navigate],
  );

  const goToMessage = useCallback(
    (nextMessageId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          messageId: nextMessageId,
        }),
      });
    },
    [navigate],
  );

  const goToTab = useCallback(
    (tab: WebhookTab) => {
      navigate({
        search: (prev) => ({
          ...prev,
          webhookTab: tab === "endpoints" ? undefined : tab,
          endpointId: undefined,
          messageId: undefined,
          attemptFilter: undefined,
        }),
      });
    },
    [navigate],
  );

  const setAttemptFilter = useCallback(
    (filter: AttemptFilter) => {
      navigate({
        search: (prev) => ({
          ...prev,
          attemptFilter: filter === "all" ? undefined : filter,
        }),
      });
    },
    [navigate],
  );

  const webhookActions = useMemo(
    () => ({
      goToEndpoints,
      goToEndpoint,
      goToMessage,
      goToTab,
      setAttemptFilter,
    }),
    [goToEndpoints, goToEndpoint, goToMessage, goToTab, setAttemptFilter],
  );

  return (
    <PageScaffold>
      {activeTab === "organization" ? (
        <div>
          <OrganizationTab />
        </div>
      ) : null}

      {activeTab === "users" ? (
        <div>
          <UsersManagementSection />
        </div>
      ) : null}

      {activeTab === "developers" ? (
        <div>
          <ApiKeysSection />
        </div>
      ) : null}

      {activeTab === "integrations" ? (
        <div>
          {isLoadingPermissions ? (
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Loading integration permissions...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full rounded-lg" />
              </CardContent>
            </Card>
          ) : canManageOrgSettings ? (
            <IntegrationsSection />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Only organization admins can manage integrations.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      ) : null}

      {activeTab === "webhooks" ? (
        <div>
          <WebhooksSection
            routeState={webhookRouteState}
            actions={webhookActions}
          />
        </div>
      ) : null}

      {activeTab === "custom-fields" ? (
        <div>
          {isLoadingPermissions ? (
            <Card>
              <CardHeader>
                <CardTitle>Custom Fields</CardTitle>
                <CardDescription>Loading permissions...</CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full rounded-lg" />
              </CardContent>
            </Card>
          ) : canManageOrgSettings ? (
            <CustomFieldsSection />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Custom Fields</CardTitle>
                <CardDescription>
                  Only organization admins can manage custom fields.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      ) : null}
    </PageScaffold>
  );
}

function OrganizationTab() {
  const {
    data: org,
    isLoading,
    error,
  } = useQuery(orpc.org.get.queryOptions({}));

  if (isLoading) {
    return (
      <dl className="divide-y divide-border">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={`settings-skel-${i}`}
            className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="sm:justify-self-end">
              <Skeleton className="h-9 w-64 rounded-md" />
            </div>
          </div>
        ))}
      </dl>
    );
  }

  if (error || !org) {
    return (
      <div className="mt-10 text-center text-destructive">
        Error loading settings
      </div>
    );
  }

  return <OrgSettingsForm org={org} />;
}

interface SettingsFormProps {
  org: OrgSettings;
}

function OrgSettingsForm({ org }: SettingsFormProps) {
  const queryClient = useQueryClient();
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
    enabled: !updateMutation.isPending && isDirty,
    scope: "global",
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
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
              Control email and notification preferences for the organization.
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
            <dt className="text-sm font-medium">Default business hours</dt>
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
        {isDirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
        <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
          {updateMutation.isPending ? "Saving..." : "Save changes"}
          <ShortcutBadge
            shortcut="meta+enter"
            className="ml-2 hidden sm:inline-flex"
          />
        </Button>
      </div>
    </form>
  );
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

interface ApiKeyListItem {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  scope: OrgMembershipRole;
  organizationId: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function getApiKeyDisplayName(apiKey: Pick<ApiKeyListItem, "name">) {
  const trimmedName = apiKey.name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : "Untitled key";
}

function getApiKeyTokenPreview(
  apiKey: Pick<ApiKeyListItem, "start" | "prefix">,
) {
  const prefix = apiKey.prefix?.trim();
  if (prefix && prefix.length > 0) return `${prefix}********`;

  const start = apiKey.start?.trim();
  return start && start.length > 0 ? `${start}********` : "********";
}

export function filterApiKeys<
  T extends {
    name: string | null;
    scope: OrgMembershipRole;
    start: string | null;
    prefix: string | null;
  },
>(
  apiKeys: readonly T[],
  input: {
    searchQuery: string;
    permissionFilter: ApiKeyPermissionFilter;
  },
): T[] {
  const query = input.searchQuery.trim().toLowerCase();
  return apiKeys.filter((apiKey) => {
    const name = apiKey.name?.toLowerCase() ?? "";
    const tokenStart = apiKey.start?.toLowerCase() ?? "";
    const tokenPrefix = apiKey.prefix?.toLowerCase() ?? "";
    const matchesQuery =
      query.length === 0 ||
      name.includes(query) ||
      tokenStart.includes(query) ||
      tokenPrefix.includes(query);
    const matchesPermission =
      input.permissionFilter === "all" ||
      apiKey.scope === input.permissionFilter;
    return matchesQuery && matchesPermission;
  });
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [permissionFilter, setPermissionFilter] =
    useState<ApiKeyPermissionFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

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
        setIsCreateModalOpen(false);
      },
    });
  };

  const onRevokeApiKey = useCallback(
    (id: string) => {
      setRevokingKeyId(id);
      revokeApiKeyMutation.mutate(
        { id },
        {
          onSettled: () => {
            setRevokingKeyId(null);
          },
        },
      );
    },
    [revokeApiKeyMutation],
  );

  const apiKeys = useMemo(
    () => (apiKeysResponse?.items ?? []) as ApiKeyListItem[],
    [apiKeysResponse],
  );

  const permissionCounts = useMemo(
    () => ({
      owner: apiKeys.filter((apiKey) => apiKey.scope === "owner").length,
      admin: apiKeys.filter((apiKey) => apiKey.scope === "admin").length,
      member: apiKeys.filter((apiKey) => apiKey.scope === "member").length,
    }),
    [apiKeys],
  );

  const filteredApiKeys = useMemo(
    () =>
      filterApiKeys(apiKeys, {
        searchQuery,
        permissionFilter,
      }),
    [apiKeys, searchQuery, permissionFilter],
  );

  useEffect(() => {
    setPagination((previousPagination) =>
      resetPaginationToFirstPage(previousPagination),
    );
  }, [searchQuery, permissionFilter]);

  const columns = useMemo<ColumnDef<ApiKeyListItem>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => getApiKeyDisplayName(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div className="font-medium">
            {getApiKeyDisplayName(row.original)}
          </div>
        ),
      },
      {
        id: "token",
        accessorFn: (row) => getApiKeyTokenPreview(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Token" />
        ),
        cell: ({ row }) => (
          <span className="inline-flex rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {getApiKeyTokenPreview(row.original)}
          </span>
        ),
      },
      {
        id: "permission",
        accessorFn: (row) => row.scope,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Permission" />
        ),
        cell: ({ row }) =>
          getOrgRoleLabel(row.original.scope) ?? row.original.scope,
      },
      {
        id: "lastUsed",
        accessorFn: (row) =>
          row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last Used" />
        ),
        cell: ({ row }) => formatDateTime(row.original.lastUsedAt),
      },
      {
        id: "created",
        accessorFn: (row) => new Date(row.createdAt).getTime(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            ariaLabel={`Actions for ${getApiKeyDisplayName(row.original)}`}
            actions={[
              {
                label:
                  revokeApiKeyMutation.isPending &&
                  revokingKeyId === row.original.id
                    ? "Revoking..."
                    : "Revoke key",
                onClick: () => onRevokeApiKey(row.original.id),
                variant: "destructive",
                disabled:
                  revokeApiKeyMutation.isPending &&
                  revokingKeyId === row.original.id,
              },
            ]}
          />
        ),
      },
    ],
    [onRevokeApiKey, revokeApiKeyMutation.isPending, revokingKeyId],
  );

  const apiKeysTable = useReactTable({
    data: filteredApiKeys,
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
        <h2 className="text-lg font-semibold tracking-tight">Developers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys for machine-to-machine integrations.
        </p>
        {!isLoading && !error ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{apiKeys.length} keys</Badge>
            <Badge variant="outline">{permissionCounts.owner} owner</Badge>
            <Badge variant="outline">{permissionCounts.admin} admin</Badge>
            <Badge variant="outline">{permissionCounts.member} member</Badge>
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
              placeholder="Search by name or token"
              className="pl-9"
            />
          </div>

          <Select
            value={permissionFilter}
            onValueChange={(value) => {
              if (isApiKeyPermissionFilter(value)) {
                setPermissionFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Permission">
                {getApiKeyPermissionFilterLabel(permissionFilter)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All permissions</SelectItem>
              {ORG_ROLE_OPTIONS.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" onClick={() => setIsCreateModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Create key
        </Button>
      </div>

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
        <div className="text-sm text-muted-foreground">Loading API keys...</div>
      ) : error ? (
        <div className="text-sm text-destructive">Failed to load API keys.</div>
      ) : !apiKeys.length ? (
        <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No API keys yet.
        </div>
      ) : !filteredApiKeys.length ? (
        <div className="rounded-xl bg-muted/30 p-6">
          <p className="text-sm text-muted-foreground">
            No API keys match the current filters.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSearchQuery("");
              setPermissionFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <EntityMobileCardList>
            {apiKeysTable.getRowModel().rows.map((row) => (
              <EntityMobileCard key={row.original.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {getApiKeyDisplayName(row.original)}
                    </h3>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {getApiKeyTokenPreview(row.original)}
                    </p>
                  </div>
                  <RowActions
                    ariaLabel={`Actions for ${getApiKeyDisplayName(row.original)}`}
                    actions={[
                      {
                        label:
                          revokeApiKeyMutation.isPending &&
                          revokingKeyId === row.original.id
                            ? "Revoking..."
                            : "Revoke key",
                        onClick: () => onRevokeApiKey(row.original.id),
                        variant: "destructive",
                        disabled:
                          revokeApiKeyMutation.isPending &&
                          revokingKeyId === row.original.id,
                      },
                    ]}
                  />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <EntityCardField
                    label="Permission"
                    value={
                      getOrgRoleLabel(row.original.scope) ?? row.original.scope
                    }
                  />
                  <EntityCardField
                    label="Last used"
                    value={formatDateTime(row.original.lastUsedAt)}
                  />
                  <EntityCardField
                    label="Created"
                    value={formatDate(row.original.createdAt)}
                  />
                </dl>
              </EntityMobileCard>
            ))}
          </EntityMobileCardList>

          <DataTablePagination
            table={apiKeysTable}
            className="justify-center rounded-xl border border-border bg-card shadow-sm md:hidden"
          />

          <div className="hidden overflow-hidden rounded-xl border border-border/50 md:block">
            <Table>
              <TableHeader>
                {apiKeysTable.getHeaderGroups().map((headerGroup) => (
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
                {apiKeysTable.getRowModel().rows.length > 0 ? (
                  apiKeysTable.getRowModel().rows.map((row) => (
                    <TableRow key={row.original.id}>
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
                      No API keys match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <DataTablePagination table={apiKeysTable} />
          </div>
        </>
      )}

      <EntityModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title="Create API key"
        description="Create scoped API keys for machine-to-machine integrations."
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={createApiKeyMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form="create-api-key-form"
              disabled={createApiKeyMutation.isPending}
            >
              {createApiKeyMutation.isPending ? "Creating..." : "Create key"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <form
            id="create-api-key-form"
            onSubmit={handleSubmit(onCreateApiKey)}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Name *</Label>
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
                <Label htmlFor="api-key-scope">Permission *</Label>
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
                        <SelectValue placeholder="Select permission">
                          {getOrgRoleLabel(field.value)}
                        </SelectValue>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key-expires-at">Expires at</Label>
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
          </form>
        </div>
      </EntityModal>
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
          setIsCreateModalOpen(false);
        },
      },
    );
  };

  const onChangeRole = useCallback(
    (input: UpdateOrgUserRoleInput) => {
      setUpdatingUserId(input.userId);
      updateRoleMutation.mutate(input, {
        onSettled: () => {
          setUpdatingUserId(null);
        },
      });
    },
    [updateRoleMutation],
  );

  const orgUsers = useMemo(() => (users ?? []) as OrgUserListItem[], [users]);

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
              <SelectValue>{getOrgRoleLabel(row.original.role)}</SelectValue>
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
              <SelectValue placeholder="Role">
                {getOrgRoleFilterLabel(roleFilter)}
              </SelectValue>
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
              <SelectValue placeholder="Status">
                {getUserStatusFilterLabel(statusFilter)}
              </SelectValue>
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

        <Button type="button" onClick={() => setIsCreateModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add user
        </Button>
      </div>

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
            onClick={() => setIsCreateModalOpen(true)}
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
                          <SelectValue>
                            {getOrgRoleLabel(user.role)}
                          </SelectValue>
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

      <EntityModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title="Add user"
        description="Add a user directly to this organization. Invite email delivery will be introduced in a follow-up release."
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={createUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form="create-org-user-form"
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? "Creating..." : "Create user"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <form
            id="create-org-user-form"
            onSubmit={handleSubmit(onCreateUser)}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-user-email">Email *</Label>
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
                <Label htmlFor="new-user-name">Name</Label>
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
            </div>

            <div className="max-w-[220px] space-y-2">
              <Label htmlFor="new-user-role">Role *</Label>
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
                      <SelectValue placeholder="Select role">
                        {getOrgRoleLabel(field.value)}
                      </SelectValue>
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
          </form>
        </div>
      </EntityModal>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearchParams => {
    const section =
      typeof search.section === "string" ? search.section : undefined;
    const webhookTab =
      typeof search.webhookTab === "string" ? search.webhookTab : undefined;
    const endpointId =
      typeof search.endpointId === "string" ? search.endpointId : undefined;
    const messageId =
      typeof search.messageId === "string" ? search.messageId : undefined;
    const attemptFilter =
      typeof search.attemptFilter === "string"
        ? search.attemptFilter
        : undefined;
    return { section, webhookTab, endpointId, messageId, attemptFilter };
  },
  component: SettingsPage,
});
