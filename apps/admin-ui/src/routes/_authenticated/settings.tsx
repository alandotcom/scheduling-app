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
  Add01Icon,
  Clock01Icon,
  Search01Icon,
  Settings01Icon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import {
  createOrgUserSchema,
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

type SettingsSection =
  | "general"
  | "scheduling"
  | "users"
  | "security"
  | "audit";

interface SettingsSectionMeta {
  value: SettingsSection;
  label: string;
  description: string;
  group: "Organization" | "Access";
  icon: Parameters<typeof Icon>[0]["icon"];
  comingSoon?: boolean;
}

const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    value: "general",
    label: "General",
    description: "Organization-wide defaults used across the app.",
    group: "Organization",
    icon: Settings01Icon,
  },
  {
    value: "scheduling",
    label: "Scheduling",
    description: "Business hours and scheduling defaults for new calendars.",
    group: "Organization",
    icon: Clock01Icon,
  },
  {
    value: "users",
    label: "Users",
    description: "Manage organization members and access roles.",
    group: "Access",
    icon: UserGroup02Icon,
  },
  {
    value: "security",
    label: "Security",
    description: "Authentication and access policies.",
    group: "Access",
    icon: Settings01Icon,
    comingSoon: true,
  },
  {
    value: "audit",
    label: "Audit log",
    description: "Visibility into configuration and user changes.",
    group: "Access",
    icon: Settings01Icon,
    comingSoon: true,
  },
];

function getSettingsSectionMeta(section: SettingsSection): SettingsSectionMeta {
  const sectionMeta = SETTINGS_SECTIONS.find(
    (candidate) => candidate.value === section,
  );
  if (!sectionMeta) {
    throw new Error(`Unknown settings section: ${section}`);
  }
  return sectionMeta;
}

const SETTINGS_NAV_GROUPS: Array<{
  label: SettingsSectionMeta["group"];
  items: SettingsSection[];
}> = [
  { label: "Organization", items: ["general", "scheduling"] },
  { label: "Access", items: ["users", "security", "audit"] },
];

const isSettingsSection = (
  value: string | null | undefined,
): value is SettingsSection =>
  typeof value === "string" &&
  SETTINGS_SECTIONS.some((section) => section.value === value);

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
  section?: SettingsSection;
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
  const activeSection: SettingsSection = section ?? "general";
  const activeSectionMeta = getSettingsSectionMeta(activeSection);
  const isOrgSettingsSection =
    activeSection === "general" || activeSection === "scheduling";
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
    enabled: isOrgSettingsSection && !updateMutation.isPending && isDirty,
    scope: "global",
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  const setActiveSection = (nextSection: SettingsSection) => {
    navigate({
      search: (prev) => ({
        ...prev,
        section: nextSection === "general" ? undefined : nextSection,
      }),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure organization and application settings.
      </p>

      <div className="mt-6 lg:hidden">
        <Label htmlFor="settings-section-select">Section</Label>
        <div className="mt-2 max-w-sm">
          <Select
            value={activeSection}
            onValueChange={(value) => {
              if (isSettingsSection(value)) {
                setActiveSection(value);
              }
            }}
          >
            <SelectTrigger id="settings-section-select">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {SETTINGS_SECTIONS.map((sectionOption) => (
                <SelectItem
                  key={sectionOption.value}
                  value={sectionOption.value}
                >
                  {sectionOption.label}
                  {sectionOption.comingSoon ? " (Coming soon)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-xl border border-border bg-card p-3 shadow-sm">
            <nav aria-label="Settings sections" className="space-y-5">
              {SETTINGS_NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((sectionValue) => {
                      const sectionItem = getSettingsSectionMeta(sectionValue);
                      const isActive = activeSection === sectionValue;
                      return (
                        <button
                          key={sectionValue}
                          type="button"
                          onClick={() => setActiveSection(sectionValue)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                            isActive
                              ? "border-border bg-muted text-foreground shadow-sm"
                              : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40 hover:text-foreground",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Icon
                              icon={sectionItem.icon}
                              className={cn(
                                "size-4",
                                isActive
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                            />
                            <span>{sectionItem.label}</span>
                          </span>
                          {sectionItem.comingSoon ? (
                            <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Soon
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-border bg-muted p-2 text-muted-foreground">
                <Icon icon={activeSectionMeta.icon} className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">
                  {activeSectionMeta.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeSectionMeta.description}
                </p>
              </div>
            </div>

            {isOrgSettingsSection && isDirty ? (
              <Badge variant="warning">Unsaved changes</Badge>
            ) : null}
          </div>

          {activeSection === "general" ? (
            <form
              ref={formRef}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
            >
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>
                    Control email and notification preferences for the
                    organization.
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

              <div className="flex justify-end">
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
          ) : null}

          {activeSection === "scheduling" ? (
            <form
              ref={formRef}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
            >
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

              <div className="flex justify-end">
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
          ) : null}

          {activeSection === "users" ? <UsersManagementSection /> : null}

          {activeSection === "security" ? (
            <ComingSoonSection
              title="Security & access controls"
              description="Centralized authentication and session policy controls are the next settings milestone."
              bullets={[
                "SSO/SAML provider configuration",
                "Session timeout and device-level controls",
                "IP allowlists and policy enforcement",
              ]}
            />
          ) : null}

          {activeSection === "audit" ? (
            <ComingSoonSection
              title="Audit logs"
              description="A structured change log for membership and settings updates will land in a follow-up release."
              bullets={[
                "User and role change history",
                "Settings update timeline with actor details",
                "Exportable audit report views",
              ]}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

interface ComingSoonSectionProps {
  title: string;
  description: string;
  bullets: string[];
}

function ComingSoonSection({
  title,
  description,
  bullets,
}: ComingSoonSectionProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
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
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Manage organization members and role access. Invite emails are coming
          next.
        </CardDescription>
        {!isLoading && !error ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{orgUsers.length} members</Badge>
            <Badge variant="outline">{roleCounts.owner} owners</Badge>
            <Badge variant="outline">{roleCounts.admin} admins</Badge>
            <Badge variant="outline">{roleCounts.member} members</Badge>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
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
            onClick={() =>
              setIsCreateFormOpen((previousState) => !previousState)
            }
            variant={isCreateFormOpen ? "outline" : "default"}
          >
            <Icon icon={Add01Icon} data-icon="inline-start" />
            {isCreateFormOpen ? "Close" : "Add user"}
          </Button>
        </div>

        {isCreateFormOpen ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold tracking-tight">Add user</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a user directly to this organization. Invite email delivery
              will be introduced in a follow-up release.
            </p>

            <form
              onSubmit={handleSubmit(onCreateUser)}
              className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
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
                {errors.email ? (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
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
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
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
          <div className="rounded-xl border border-border bg-muted/20 p-6">
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

            <div className="hidden overflow-hidden rounded-xl border border-border shadow-sm md:block">
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
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearchParams => {
    const rawSection = typeof search.section === "string" ? search.section : "";
    const section = isSettingsSection(rawSection) ? rawSection : undefined;
    return { section };
  },
  component: SettingsPage,
});
