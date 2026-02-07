// Root route layout with modern navigation shell

import { useState } from "react";
import {
  createRootRoute,
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import {
  Calendar03Icon,
  UserGroup02Icon,
  Clock01Icon,
  Settings01Icon,
  Logout01Icon,
  Location01Icon,
  Package01Icon,
  Layers01Icon,
  Menu01Icon,
  Cancel01Icon,
  Home01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/command-palette";
import { useNavigationShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

function RootLayout() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const location = useLocation();
  const user = session?.user;
  const isAuthenticated = !!session;
  const isInitialAuthCheck = isLoading && session === undefined;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Enable keyboard navigation shortcuts when authenticated
  useNavigationShortcuts(isAuthenticated);

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
    return <Navigate to="/" replace />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <Outlet />
      </div>
    );
  }

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

          {/* User avatar */}
          <div
            className={cn(
              "mt-3 flex items-center gap-3 rounded-lg px-3 py-2",
              sidebarCollapsed && "justify-center px-0",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? "U"}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium text-sidebar-primary">
                  {user?.name ?? user?.email}
                </div>
                <div className="truncate text-[11px] text-sidebar-foreground/50">
                  {user?.email}
                </div>
              </div>
            )}
            {!sidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void authClient.signOut()}
                title="Sign out"
                aria-label="Sign out"
                className="text-sidebar-foreground/50 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent shrink-0"
              >
                <Icon icon={Logout01Icon} />
              </Button>
            )}
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
            <kbd className="ml-4 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {"K"}
            </kbd>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void authClient.signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="lg:hidden"
            >
              <Icon icon={Logout01Icon} />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
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
                <SheetClose key={item.to} asChild>
                  <SidebarLink to={item.to} icon={item.icon}>
                    {item.label}
                  </SidebarLink>
                </SheetClose>
              ))}
            </div>
            <div className="mt-4 border-t border-sidebar-border pt-4">
              {bottomNavItems.map((item) => (
                <SheetClose key={item.to} asChild>
                  <SidebarLink to={item.to} icon={item.icon}>
                    {item.label}
                  </SidebarLink>
                </SheetClose>
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
                  {user?.email}
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

      {/* Dev tools - only in development */}
      {import.meta.env.DEV ? (
        <TanStackRouterDevtools position="bottom-right" />
      ) : null}
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
});
