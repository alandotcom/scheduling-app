// Root route layout with modern navigation shell

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ErrorComponentProps,
  createRootRoute,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  ArrowRight01Icon,
  Calendar03Icon,
  UserGroup02Icon,
  Clock01Icon,
  Settings01Icon,
  Location01Icon,
  Package01Icon,
  Layers01Icon,
  Menu01Icon,
  Home01Icon,
  Search01Icon,
  Add01Icon,
  Logout01Icon,
} from "@hugeicons/core-free-icons";
import { Collapsible } from "@base-ui/react/collapsible";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirectHref } from "@/lib/auth-redirect";
import { UserMenu, type UserMenuOrganization } from "@/components/user-menu";
import { ShortcutsHelpDialog } from "@/components/shortcuts-help-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/command-palette";
import {
  useKeyboardShortcuts,
  useNavigationShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { getQueryClient, orpc } from "@/lib/query";
import { isIgnorableRouteLoaderError } from "@/lib/query-cancellation";

interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: unknown;
  createdAt: Date;
}

interface OrganizationMembershipListItem {
  orgId: string;
  role: "owner" | "admin" | "member";
}

type OrganizationGateState = "loading" | "selection" | "error" | "ready";

export function getOrganizationGateState(input: {
  isOrganizationsPending: boolean;
  organizationsError: unknown;
  activeOrganizationId: string | null;
  hasValidActiveOrganization: boolean;
  hasStableActiveOrganization: boolean;
}): OrganizationGateState {
  if (input.isOrganizationsPending && !input.hasStableActiveOrganization) {
    return "loading";
  }
  if (input.organizationsError) return "error";
  if (!input.activeOrganizationId) return "selection";
  if (!input.hasValidActiveOrganization && !input.hasStableActiveOrganization) {
    return "loading";
  }
  return "ready";
}

const ORG_SWITCH_OVERLAY_DELAY_MS = 150;
const ORG_SWITCH_OVERLAY_MIN_VISIBLE_MS = 350;
const ORG_SWITCH_STRIPPED_SEARCH_KEYS = [
  "selected",
  "appointment",
  "clientId",
  "calendarId",
  "appointmentTypeId",
  "endpointId",
  "messageId",
  "create",
] as const;

function canManageIntegrationsForRole(
  role: "owner" | "admin" | "member" | null,
): boolean {
  return role === "owner" || role === "admin";
}

export function sanitizeSearchParamsForOrganizationSwitch(
  searchStr: string,
): string {
  const params = new URLSearchParams(searchStr);
  for (const key of ORG_SWITCH_STRIPPED_SEARCH_KEYS) {
    params.delete(key);
  }
  if (!params.has("selected")) {
    params.delete("tab");
  }
  if (!params.has("appointment")) {
    params.delete("appointmentTab");
  }
  return params.toString();
}

export function getRemainingMinimumVisibleMs(input: {
  shownAtMs: number | null;
  nowMs: number;
  minVisibleMs: number;
}): number {
  if (input.shownAtMs === null) return 0;
  return Math.max(0, input.minVisibleMs - (input.nowMs - input.shownAtMs));
}

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function buildOrganizationSlug(name: string, slug?: string): string {
  if (slug) return slug;

  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = crypto.randomUUID().slice(-6);
  return `${base || "org"}-${randomSuffix}`;
}

function RootLayout() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const user = session?.user;
  const isAuthenticated = !!session;
  const isInitialAuthCheck = isLoading && !session;
  const loginRedirect = getSafeRedirectHref(
    new URLSearchParams(window.location.search).get("redirect") ?? undefined,
    window.location.origin,
  );
  const [selectingOrganizationId, setSelectingOrganizationId] = useState<
    string | null
  >(null);
  const [organizationSelectionError, setOrganizationSelectionError] = useState<
    string | null
  >(null);
  const [showCreateOrganizationForm, setShowCreateOrganizationForm] =
    useState(false);
  const [createOrganizationName, setCreateOrganizationName] = useState("");
  const [createOrganizationSlug, setCreateOrganizationSlug] = useState("");
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [lastStableActiveOrganization, setLastStableActiveOrganization] =
    useState<OrganizationListItem | null>(null);
  const [isOrganizationSwitchPending, setIsOrganizationSwitchPending] =
    useState(false);
  const [
    isOrganizationSwitchOverlayVisible,
    setIsOrganizationSwitchOverlayVisible,
  ] = useState(false);
  const [pendingOrganizationName, setPendingOrganizationName] = useState<
    string | null
  >(null);
  const organizationSwitchOverlayShownAtRef = useRef<number | null>(null);

  const organizationsQuery = useQuery({
    queryKey: ["auth", "organizations"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const result = await authClient.organization.list();
      if (result.error) {
        throw new Error(
          result.error.message ?? "Failed to load organizations.",
        );
      }
      return (result.data ?? []) as OrganizationListItem[];
    },
  });
  const membershipsQuery = useQuery({
    ...orpc.org.listMemberships.queryOptions({}),
    enabled: isAuthenticated,
  });
  const {
    isPending: isOrganizationsPending,
    error: organizationsError,
    refetch: refetchOrganizations,
  } = organizationsQuery;

  const organizations = organizationsQuery.data ?? [];
  const memberships =
    (membershipsQuery.data as OrganizationMembershipListItem[] | undefined) ??
    [];
  const organizationMenuItems = useMemo<UserMenuOrganization[]>(
    () =>
      organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })),
    [organizations],
  );

  const activeOrganizationId = session?.session.activeOrganizationId ?? null;
  const activeOrganizationRole = useMemo(() => {
    if (!activeOrganizationId) {
      return null;
    }

    return (
      memberships.find(
        (membership) => membership.orgId === activeOrganizationId,
      )?.role ?? null
    );
  }, [activeOrganizationId, memberships]);
  const canManageIntegrations = canManageIntegrationsForRole(
    activeOrganizationRole,
  );
  const activeOrganization = useMemo(
    () =>
      activeOrganizationId
        ? (organizations.find(
            (organization) => organization.id === activeOrganizationId,
          ) ?? null)
        : null,
    [activeOrganizationId, organizations],
  );
  const hasValidActiveOrganization = !!activeOrganization;
  const displayActiveOrganization =
    activeOrganization ?? lastStableActiveOrganization;
  const organizationGateState = getOrganizationGateState({
    isOrganizationsPending,
    organizationsError,
    activeOrganizationId,
    hasValidActiveOrganization,
    hasStableActiveOrganization: !!lastStableActiveOrganization,
  });

  useEffect(() => {
    if (!activeOrganization) return;
    setLastStableActiveOrganization(activeOrganization);
  }, [activeOrganization]);

  useEffect(() => {
    if (!isOrganizationSwitchPending) return;
    const showTimer = window.setTimeout(() => {
      organizationSwitchOverlayShownAtRef.current = Date.now();
      setIsOrganizationSwitchOverlayVisible(true);
    }, ORG_SWITCH_OVERLAY_DELAY_MS);
    return () => {
      window.clearTimeout(showTimer);
    };
  }, [isOrganizationSwitchPending]);

  const finishOrganizationSwitchTransition = async () => {
    const remainingMs = getRemainingMinimumVisibleMs({
      shownAtMs: organizationSwitchOverlayShownAtRef.current,
      nowMs: Date.now(),
      minVisibleMs: ORG_SWITCH_OVERLAY_MIN_VISIBLE_MS,
    });
    if (remainingMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, remainingMs);
      });
    }
    organizationSwitchOverlayShownAtRef.current = null;
    setIsOrganizationSwitchOverlayVisible(false);
    setIsOrganizationSwitchPending(false);
    setPendingOrganizationName(null);
  };

  const navigateToSanitizedOrganizationSearch = async () => {
    const currentSearch = new URLSearchParams(location.searchStr).toString();
    const sanitizedSearch = sanitizeSearchParamsForOrganizationSwitch(
      location.searchStr,
    );
    if (currentSearch === sanitizedSearch) return;
    await navigate({
      href: sanitizedSearch
        ? `${location.pathname}?${sanitizedSearch}`
        : location.pathname,
      replace: true,
    });
  };

  const switchOrganizationContext = async (
    organizationId: string,
    organizationName?: string,
  ) => {
    if (organizationId === activeOrganizationId) return;
    setPendingOrganizationName(organizationName ?? "organization");
    setIsOrganizationSwitchPending(true);
    setIsOrganizationSwitchOverlayVisible(false);
    organizationSwitchOverlayShownAtRef.current = null;
    try {
      await queryClient.cancelQueries();
      const result = await authClient.organization.setActive({
        organizationId,
      });
      if (result.error) {
        throw new Error(
          result.error.message ?? "Failed to switch organization.",
        );
      }
      await navigateToSanitizedOrganizationSearch();
      await Promise.all([
        queryClient.invalidateQueries(),
        refetchOrganizations(),
      ]);
    } finally {
      await finishOrganizationSwitchTransition();
    }
  };

  const onSwitchOrganization = async (organizationId: string) => {
    if (organizationId === activeOrganizationId) return;
    const nextOrganizationName = organizations.find(
      (organization) => organization.id === organizationId,
    )?.name;
    await switchOrganizationContext(organizationId, nextOrganizationName);
  };

  const onCreateOrganization = async (input: {
    name: string;
    slug?: string;
  }) => {
    const slug = buildOrganizationSlug(input.name, input.slug);

    const createResult = await authClient.organization.create({
      name: input.name,
      slug,
    });
    if (createResult.error || !createResult.data) {
      throw new Error(
        createResult.error?.message ?? "Failed to create organization.",
      );
    }

    await switchOrganizationContext(createResult.data.id, input.name);
  };

  const onSignOut = async () => {
    const result = await authClient.signOut();
    if (result.error) {
      throw new Error(result.error.message ?? "Failed to sign out.");
    }
    queryClient.clear();
  };

  const onSelectOrganizationFromGate = async (organizationId: string) => {
    setOrganizationSelectionError(null);
    setSelectingOrganizationId(organizationId);
    try {
      await onSwitchOrganization(organizationId);
    } catch (error) {
      setOrganizationSelectionError(
        error instanceof Error
          ? error.message
          : "Failed to switch organization.",
      );
    } finally {
      setSelectingOrganizationId(null);
    }
  };

  const onCreateOrganizationFromGate = async () => {
    const name = createOrganizationName.trim();
    const slug = createOrganizationSlug.trim();
    if (!name) {
      setOrganizationSelectionError("Organization name is required.");
      return;
    }

    setOrganizationSelectionError(null);
    setIsCreatingOrganization(true);
    try {
      await onCreateOrganization({
        name,
        slug: slug || undefined,
      });
      setCreateOrganizationName("");
      setCreateOrganizationSlug("");
      setShowCreateOrganizationForm(false);
    } catch (error) {
      setOrganizationSelectionError(
        error instanceof Error
          ? error.message
          : "Failed to create organization.",
      );
    } finally {
      setIsCreatingOrganization(false);
    }
  };

  // Enable keyboard navigation shortcuts when authenticated
  useNavigationShortcuts(isAuthenticated);
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+/", "ctrl+/", "meta+?", "ctrl+?"],
        action: () => setShortcutsHelpOpen(true),
        description: "Open keyboard shortcut help",
        ignoreInputs: false,
      },
    ],
    enabled: isAuthenticated,
  });

  if (isInitialAuthCheck) {
    return (
      <div className="flex h-[100dvh] overflow-hidden bg-sidebar animate-skeleton-fade-in">
        <div className="hidden w-60 flex-col p-2 lg:flex">
          <div className="flex items-center gap-2.5 px-3 py-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex-1 px-2 py-2 space-y-1">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton
                key={`nav-skeleton-${i}`}
                className="h-8 w-full rounded-md"
              />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col bg-background m-2 ml-0 rounded-xl shadow-sm">
          <div className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
            <Skeleton className="h-5 w-20 lg:hidden" />
            <div className="hidden lg:block" />
            <div className="flex items-center gap-3">
              <Skeleton className="hidden h-8 w-32 rounded-lg lg:block" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
          <div className="flex-1" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && location.pathname !== "/login") {
    return (
      <Navigate to="/login" search={{ redirect: location.href }} replace />
    );
  }

  if (isAuthenticated && location.pathname === "/login") {
    return <Navigate to="/" href={loginRedirect} replace />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <Outlet />
      </div>
    );
  }

  const shouldShowOrganizationSelectionGate =
    organizationGateState === "selection";

  if (shouldShowOrganizationSelectionGate) {
    return (
      <OrganizationSelectionScreen
        organizations={organizationMenuItems}
        isSelectingOrganization={selectingOrganizationId !== null}
        selectingOrganizationId={selectingOrganizationId}
        onSelectOrganization={onSelectOrganizationFromGate}
        showCreateOrganizationForm={
          showCreateOrganizationForm || organizationMenuItems.length === 0
        }
        onShowCreateOrganizationForm={setShowCreateOrganizationForm}
        createOrganizationName={createOrganizationName}
        onCreateOrganizationNameChange={setCreateOrganizationName}
        createOrganizationSlug={createOrganizationSlug}
        onCreateOrganizationSlugChange={setCreateOrganizationSlug}
        isCreatingOrganization={isCreatingOrganization}
        onCreateOrganization={onCreateOrganizationFromGate}
        error={organizationSelectionError}
        onSignOut={onSignOut}
      />
    );
  }

  const isResolvingActiveOrganization =
    organizationGateState === "loading" && !displayActiveOrganization;

  const navItems = [
    { to: "/", icon: Home01Icon, label: "Dashboard" },
    { to: "/appointments", icon: Clock01Icon, label: "Appointments" },
    { to: "/clients", icon: UserGroup02Icon, label: "Clients" },
    { to: "/calendars", icon: Calendar03Icon, label: "Calendars" },
    {
      to: "/appointment-types",
      icon: Layers01Icon,
      label: "Appt Types",
    },
    { to: "/resources", icon: Package01Icon, label: "Resources" },
    { to: "/locations", icon: Location01Icon, label: "Locations" },
  ];

  return (
    <SidebarProvider
      defaultOpen={
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1280px)").matches
      }
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to Main Content
      </a>

      <AppSidebar
        user={user}
        displayActiveOrganization={displayActiveOrganization}
        canManageIntegrations={canManageIntegrations}
        navItems={navItems}
        organizationMenuItems={organizationMenuItems}
        activeOrganizationId={activeOrganizationId}
        onSwitchOrganization={onSwitchOrganization}
        onCreateOrganization={onCreateOrganization}
        onSignOut={onSignOut}
      />

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 shrink-0 lg:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger aria-label="Toggle navigation menu">
              <Icon icon={Menu01Icon} className="size-5" />
            </SidebarTrigger>
            <Link
              to="/"
              preload="intent"
              className="text-base font-semibold tracking-tight lg:hidden"
            >
              Scheduling
            </Link>
          </div>

          {/* Search trigger */}
          <button
            type="button"
            onClick={() => {
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              );
            }}
            className="hidden items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
          >
            <Icon icon={Search01Icon} className="size-3.5" />
            <span>Search…</span>
            <ShortcutBadge shortcut="meta+k" className="ml-4" />
          </button>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 text-right lg:block">
              {isResolvingActiveOrganization ? (
                <div className="animate-skeleton-fade-in">
                  <Skeleton className="ml-auto h-4 w-32" />
                  <Skeleton className="mt-1.5 ml-auto h-3 w-24" />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-medium">
                    {displayActiveOrganization?.name ??
                      "No active organization"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {displayActiveOrganization
                      ? user?.email
                      : "Select or create an organization"}
                  </p>
                </>
              )}
            </div>
            <div className="lg:hidden">
              <UserMenu
                userName={user?.name}
                userEmail={user?.email}
                organizations={organizationMenuItems}
                activeOrganizationId={activeOrganizationId}
                onSwitchOrganization={onSwitchOrganization}
                onCreateOrganization={onCreateOrganization}
                onSignOut={onSignOut}
              />
            </div>
            <Popover.Root open={helpMenuOpen} onOpenChange={setHelpMenuOpen}>
              <Popover.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Open help menu"
                    className="hidden md:inline-flex"
                  >
                    ?
                  </Button>
                }
              />
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="end" sideOffset={8}>
                  <Popover.Popup className="z-50 min-w-52 rounded-lg border border-border bg-background p-1 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 duration-100">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Help
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        setShortcutsHelpOpen(true);
                        setHelpMenuOpen(false);
                      }}
                    >
                      Keyboard shortcuts
                    </button>
                    <a
                      href="/api/v1/docs"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setHelpMenuOpen(false)}
                    >
                      OpenAPI docs
                    </a>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </header>

        <main
          id="main-content"
          aria-busy={isOrganizationSwitchPending}
          className="relative flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
        >
          {isResolvingActiveOrganization ? (
            <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 animate-skeleton-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-7 w-36" />
                  <Skeleton className="mt-2 h-4 w-52" />
                </div>
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
              <div className="mt-8">
                <TableSkeleton rows={6} cols={4} />
              </div>
            </section>
          ) : organizationGateState === "error" ? (
            <div className="mx-auto max-w-2xl px-4 py-10">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <h2 className="text-sm font-semibold text-destructive">
                  Unable to load organizations
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getAuthErrorMessage(
                    organizationsError,
                    "Please refresh and try again.",
                  )}
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  size="sm"
                  onClick={() => void refetchOrganizations()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
          {isOrganizationSwitchOverlayVisible ? (
            <div className="absolute inset-0 z-20 flex items-start justify-center bg-background/40 pt-6 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-primary animate-pulse"
                />
                <p
                  role="status"
                  aria-live="polite"
                  className="text-sm font-medium"
                >
                  Switching to {pendingOrganizationName ?? "organization"}…
                </p>
              </div>
            </div>
          ) : null}
        </main>
      </SidebarInset>

      <Toaster richColors position="top-right" />
      <CommandPalette />
      <ShortcutsHelpDialog
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />
    </SidebarProvider>
  );
}

function OrganizationSelectionScreen({
  organizations,
  isSelectingOrganization,
  selectingOrganizationId,
  onSelectOrganization,
  showCreateOrganizationForm,
  onShowCreateOrganizationForm,
  createOrganizationName,
  onCreateOrganizationNameChange,
  createOrganizationSlug,
  onCreateOrganizationSlugChange,
  isCreatingOrganization,
  onCreateOrganization,
  error,
  onSignOut,
}: {
  organizations: UserMenuOrganization[];
  isSelectingOrganization: boolean;
  selectingOrganizationId: string | null;
  onSelectOrganization: (organizationId: string) => Promise<void>;
  showCreateOrganizationForm: boolean;
  onShowCreateOrganizationForm: (show: boolean) => void;
  createOrganizationName: string;
  onCreateOrganizationNameChange: (value: string) => void;
  createOrganizationSlug: string;
  onCreateOrganizationSlugChange: (value: string) => void;
  isCreatingOrganization: boolean;
  onCreateOrganization: () => Promise<void>;
  error: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-bold">Select Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a workspace to continue.
        </p>

        <div className="mt-5 space-y-2">
          {organizations.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              No organizations yet. Create one to continue.
            </p>
          ) : (
            organizations.map((organization) => (
              <Button
                key={organization.id}
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={isSelectingOrganization || isCreatingOrganization}
                onClick={() => void onSelectOrganization(organization.id)}
              >
                {selectingOrganizationId === organization.id
                  ? "Switching…"
                  : organization.name}
              </Button>
            ))
          )}
        </div>

        {showCreateOrganizationForm ? (
          <form
            className="mt-5 space-y-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateOrganization();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="org-select-name">Organization name</Label>
              <Input
                id="org-select-name"
                value={createOrganizationName}
                onChange={(event) =>
                  onCreateOrganizationNameChange(event.target.value)
                }
                placeholder="Acme Scheduling"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-select-slug">Slug (optional)</Label>
              <Input
                id="org-select-slug"
                value={createOrganizationSlug}
                onChange={(event) =>
                  onCreateOrganizationSlugChange(event.target.value)
                }
                placeholder="acme-scheduling"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {organizations.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onShowCreateOrganizationForm(false)}
                >
                  Cancel
                </Button>
              ) : (
                <div />
              )}
              <Button
                type="submit"
                disabled={isCreatingOrganization || isSelectingOrganization}
              >
                {isCreatingOrganization ? "Creating…" : "Create organization"}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={() => onShowCreateOrganizationForm(true)}
          >
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Create organization
          </Button>
        )}

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full text-destructive hover:text-destructive"
          disabled={isSigningOut}
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await onSignOut();
            } finally {
              setIsSigningOut(false);
            }
          }}
        >
          <Icon icon={Logout01Icon} data-icon="inline-start" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}

function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
  if (isIgnorableRouteLoaderError(error)) {
    return null;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h1 className="text-sm font-semibold text-destructive">Route error</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {getAuthErrorMessage(error, "Something went wrong while loading.")}
        </p>
        <Button
          type="button"
          className="mt-3"
          size="sm"
          onClick={() => reset()}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

const BASE_SETTINGS_SUB_ITEMS = [
  { section: undefined, label: "Organization" },
  { section: "users" as const, label: "Users" },
  { section: "developers" as const, label: "Developers" },
  { section: "integrations" as const, label: "Integrations" },
  { section: "webhooks" as const, label: "Webhooks" },
];

const SETTINGS_COMING_SOON = [{ label: "Security" }, { label: "Audit" }];

function AppSidebar({
  user,
  displayActiveOrganization,
  canManageIntegrations,
  navItems,
  organizationMenuItems,
  activeOrganizationId,
  onSwitchOrganization,
  onCreateOrganization,
  onSignOut,
}: {
  user: { name?: string | null; email: string } | undefined;
  displayActiveOrganization: OrganizationListItem | null;
  canManageIntegrations: boolean;
  navItems: {
    to: string;
    icon: React.ComponentProps<typeof Icon>["icon"];
    label: string;
  }[];
  organizationMenuItems: UserMenuOrganization[];
  activeOrganizationId: string | null;
  onSwitchOrganization: (organizationId: string) => Promise<void>;
  onCreateOrganization: (input: {
    name: string;
    slug?: string;
  }) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const { state: sidebarState, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const location = useLocation();
  const isOnSettings = location.pathname.startsWith("/settings");
  const currentSection = isOnSettings
    ? (new URLSearchParams(location.searchStr).get("section") ?? undefined)
    : null;
  const settingsSubItems = canManageIntegrations
    ? BASE_SETTINGS_SUB_ITEMS
    : BASE_SETTINGS_SUB_ITEMS.filter((item) => item.section !== "integrations");
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettings);
  useEffect(() => {
    if (isOnSettings) setSettingsExpanded(true);
  }, [isOnSettings]);

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <Link
          to="/"
          preload="intent"
          className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:px-0"
          onClick={() => setOpenMobile(false)}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
            S
          </div>
          <span className="text-sm font-semibold tracking-tight text-sidebar-primary group-data-[collapsible=icon]:hidden">
            Scheduling
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link
                      to={item.to}
                      preload="intent"
                      activeOptions={{ exact: item.to === "/" }}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Icon icon={item.icon} className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isCollapsed ? (
                <SidebarMenuItem>
                  <Popover.Root>
                    <Popover.Trigger
                      render={
                        <SidebarMenuButton tooltip="Settings">
                          <Icon icon={Settings01Icon} className="size-4" />
                          <span>Settings</span>
                        </SidebarMenuButton>
                      }
                    />
                    <Popover.Portal>
                      <Popover.Positioner
                        side="right"
                        align="start"
                        sideOffset={8}
                      >
                        <Popover.Popup className="z-50 min-w-44 rounded-lg border border-border bg-background p-1 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 duration-100">
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Settings
                          </div>
                          {settingsSubItems.map((item) => {
                            const isActive =
                              isOnSettings &&
                              currentSection === (item.section ?? undefined) &&
                              (item.section !== undefined ||
                                currentSection === undefined);
                            return (
                              <Link
                                key={item.label}
                                to="/settings"
                                search={{ section: item.section }}
                                className={cn(
                                  "flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                                  isActive && "bg-accent font-medium",
                                )}
                              >
                                {item.label}
                              </Link>
                            );
                          })}
                          {SETTINGS_COMING_SOON.map((item) => (
                            <div
                              key={item.label}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground/50"
                            >
                              <span>{item.label}</span>
                              <span className="text-[10px] uppercase tracking-wide">
                                Soon
                              </span>
                            </div>
                          ))}
                        </Popover.Popup>
                      </Popover.Positioner>
                    </Popover.Portal>
                  </Popover.Root>
                </SidebarMenuItem>
              ) : (
                <Collapsible.Root
                  open={settingsExpanded}
                  onOpenChange={setSettingsExpanded}
                >
                  <SidebarMenuItem>
                    <Collapsible.Trigger
                      render={
                        <SidebarMenuButton tooltip="Settings">
                          <Icon icon={Settings01Icon} className="size-4" />
                          <span>Settings</span>
                          <Icon
                            icon={ArrowRight01Icon}
                            className="ml-auto size-3.5 transition-transform duration-200 data-[panel-open]:rotate-90"
                          />
                        </SidebarMenuButton>
                      }
                    />
                    <Collapsible.Panel>
                      <SidebarMenuSub>
                        {settingsSubItems.map((item) => {
                          const isActive =
                            isOnSettings &&
                            currentSection === (item.section ?? undefined) &&
                            (item.section !== undefined ||
                              currentSection === undefined);
                          return (
                            <SidebarMenuSubItem key={item.label}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link
                                  to="/settings"
                                  search={{ section: item.section }}
                                  onClick={() => setOpenMobile(false)}
                                  onMouseEnter={() => {
                                    const qc = getQueryClient();
                                    qc.ensureQueryData(
                                      orpc.org.get.queryOptions({}),
                                    );
                                    if (item.section === "integrations") {
                                      qc.ensureQueryData(
                                        orpc.integrations.list.queryOptions({}),
                                      );
                                    }
                                    if (item.section === "webhooks") {
                                      qc.ensureQueryData(
                                        orpc.webhooks.session.queryOptions({}),
                                      );
                                    }
                                  }}
                                >
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                        {SETTINGS_COMING_SOON.map((item) => (
                          <SidebarMenuSubItem key={item.label}>
                            <SidebarMenuSubButton aria-disabled="true">
                              <span>{item.label}</span>
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-sidebar-foreground/40">
                                Soon
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </Collapsible.Panel>
                  </SidebarMenuItem>
                </Collapsible.Root>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium text-sidebar-primary">
              {user?.name ?? user?.email}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/50">
              {displayActiveOrganization?.name ?? user?.email}
            </div>
          </div>
          <UserMenu
            userName={user?.name}
            userEmail={user?.email}
            organizations={organizationMenuItems}
            activeOrganizationId={activeOrganizationId}
            onSwitchOrganization={onSwitchOrganization}
            onCreateOrganization={onCreateOrganization}
            onSignOut={onSignOut}
            popoverSide="right"
            popoverAlign="end"
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
});
