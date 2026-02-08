// Root route layout with modern navigation shell

import { useEffect, useMemo, useState } from "react";
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
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import {
  Calendar03Icon,
  UserGroup02Icon,
  Clock01Icon,
  Settings01Icon,
  Location01Icon,
  Package01Icon,
  Layers01Icon,
  Menu01Icon,
  Cancel01Icon,
  Home01Icon,
  Search01Icon,
  Add01Icon,
  Logout01Icon,
} from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirectHref } from "@/lib/auth-redirect";
import { UserMenu, type UserMenuOrganization } from "@/components/user-menu";
import { ShortcutsHelpDialog } from "@/components/shortcuts-help-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Toaster, toast } from "sonner";
import { CommandPalette } from "@/components/command-palette";
import {
  useKeyboardShortcuts,
  useNavigationShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { isIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import { cn } from "@/lib/utils";

interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: unknown;
  createdAt: Date;
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
  const isInitialAuthCheck = isLoading && session === undefined;
  const loginRedirect = getSafeRedirectHref(
    new URLSearchParams(window.location.search).get("redirect") ?? undefined,
    window.location.origin,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1279px)").matches,
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
  const [lastStableActiveOrganization, setLastStableActiveOrganization] =
    useState<OrganizationListItem | null>(null);

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
  const {
    isPending: isOrganizationsPending,
    error: organizationsError,
    refetch: refetchOrganizations,
  } = organizationsQuery;

  const organizations = organizationsQuery.data ?? [];
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

  useEffect(() => {
    if (!activeOrganization) return;
    setLastStableActiveOrganization(activeOrganization);
  }, [activeOrganization]);

  const resetOrgScopedState = async () => {
    await navigate({
      href: location.pathname,
      replace: true,
    });
    queryClient.clear();
  };

  const onSwitchOrganization = async (organizationId: string) => {
    if (organizationId === activeOrganizationId) return;

    const result = await authClient.organization.setActive({ organizationId });
    if (result.error) {
      throw new Error(result.error.message ?? "Failed to switch organization.");
    }

    await resetOrgScopedState();
    await refetchOrganizations();
    setMobileMenuOpen(false);
    toast.success("Organization switched.");
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

    const setActiveResult = await authClient.organization.setActive({
      organizationId: createResult.data.id,
    });
    if (setActiveResult.error) {
      throw new Error(
        setActiveResult.error.message ?? "Failed to activate organization.",
      );
    }

    await resetOrgScopedState();
    await refetchOrganizations();
    setMobileMenuOpen(false);
    toast.success("Organization created.");
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
          <span
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Loading...
          </span>
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
    !isOrganizationsPending && !organizationsError && !activeOrganizationId;

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
    !!activeOrganizationId &&
    !hasValidActiveOrganization &&
    isOrganizationsPending;

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

  const bottomNavItems = [
    { to: "/settings", icon: Settings01Icon, label: "Settings" },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to Main Content
      </a>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden flex-col bg-sidebar text-sidebar-foreground lg:flex transition-all duration-200 ease-out",
          sidebarCollapsed ? "w-[68px]" : "w-60",
        )}
      >
        {/* Logo area */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-sidebar-border shrink-0",
            sidebarCollapsed ? "justify-center px-2" : "px-5",
          )}
        >
          <Link to="/" preload="intent" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
              S
            </div>
            {!sidebarCollapsed && (
              <span className="text-sm font-semibold tracking-tight text-sidebar-primary">
                Scheduling
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-3",
            sidebarCollapsed ? "px-2" : "px-3",
          )}
        >
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <SidebarLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                collapsed={sidebarCollapsed}
              >
                {item.label}
              </SidebarLink>
            ))}
          </div>
        </nav>

        {/* Bottom section */}
        <div
          className={cn(
            "border-t border-sidebar-border py-3",
            sidebarCollapsed ? "px-2" : "px-3",
          )}
        >
          {bottomNavItems.map((item) => (
            <SidebarLink
              key={item.to}
              to={item.to}
              icon={item.icon}
              collapsed={sidebarCollapsed}
            >
              {item.label}
            </SidebarLink>
          ))}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/50",
              "transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              sidebarCollapsed && "justify-center",
            )}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={cn(
                "shrink-0 transition-transform duration-200",
                sidebarCollapsed && "rotate-180",
              )}
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>

          {/* User menu */}
          <div
            className={cn(
              "mt-3 flex items-center gap-3 rounded-lg px-3 py-2",
              sidebarCollapsed && "justify-center px-0",
            )}
          >
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium text-sidebar-primary">
                  {user?.name ?? user?.email}
                </div>
                <div className="truncate text-[11px] text-sidebar-foreground/50">
                  {displayActiveOrganization?.name ?? user?.email}
                </div>
              </div>
            )}
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
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 shrink-0 lg:px-6">
          {/* Mobile menu button */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden"
            >
              <Icon icon={Menu01Icon} className="size-5" />
            </Button>
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
            <span>Search...</span>
            <ShortcutBadge shortcut="meta+k" className="ml-4" />
          </button>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 text-right lg:block">
              <p className="truncate text-sm font-medium">
                {displayActiveOrganization?.name ?? "No active organization"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {displayActiveOrganization
                  ? user?.email
                  : "Select or create an organization"}
              </p>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShortcutsHelpOpen(true)}
              aria-label="Open keyboard shortcuts help"
              className="hidden md:inline-flex"
            >
              ?
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 min-w-0 overflow-y-auto">
          {isResolvingActiveOrganization ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading organization...
                </p>
              </div>
            </div>
          ) : organizationsError ? (
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
        </main>
      </div>

      {/* Mobile Navigation Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 touch-manipulation overscroll-contain bg-sidebar text-sidebar-foreground"
        >
          <SheetHeader className="border-b border-sidebar-border px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
                  S
                </div>
                <SheetTitle className="text-sidebar-primary text-sm font-semibold">
                  Scheduling
                </SheetTitle>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close menu"
                  className="text-sidebar-foreground/50 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                >
                  <Icon icon={Cancel01Icon} />
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>
          <nav className="flex-1 px-3 py-3">
            <div className="flex flex-col gap-0.5">
              {navItems.map((item) => (
                <div
                  key={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  onKeyDown={() => {}}
                  role="presentation"
                >
                  <SidebarLink to={item.to} icon={item.icon}>
                    {item.label}
                  </SidebarLink>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-sidebar-border pt-4">
              {bottomNavItems.map((item) => (
                <div
                  key={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  onKeyDown={() => {}}
                  role="presentation"
                >
                  <SidebarLink to={item.to} icon={item.icon}>
                    {item.label}
                  </SidebarLink>
                </div>
              ))}
            </div>
          </nav>
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                {user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-xs font-medium text-sidebar-primary">
                  {user?.name ?? user?.email}
                </div>
                <div className="truncate text-[11px] text-sidebar-foreground/50">
                  {displayActiveOrganization?.name ?? user?.email}
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Toast notifications */}
      <Toaster richColors position="top-right" />

      {/* Command palette (Cmd+K) */}
      <CommandPalette />

      <ShortcutsHelpDialog
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />

      {/* Dev tools - only in development */}
      {import.meta.env.DEV ? (
        <TanStackRouterDevtools position="bottom-right" />
      ) : null}
    </div>
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
                  ? "Switching..."
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
                {isCreatingOrganization ? "Creating..." : "Create organization"}
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
          {isSigningOut ? "Signing out..." : "Sign out"}
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

function SidebarLink({
  to,
  icon,
  collapsed = false,
  children,
}: {
  to: string;
  icon: React.ComponentProps<typeof Icon>["icon"];
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      activeOptions={{ exact: to === "/" }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/70",
        "transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "[&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon icon={icon} className="size-4 shrink-0" />
      {!collapsed && <span>{children}</span>}
    </Link>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
});
