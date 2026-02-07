// Root route layout with navigation shell

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

  // Enable keyboard navigation shortcuts when authenticated
  useNavigationShortcuts(isAuthenticated);

  if (isInitialAuthCheck) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground" role="status" aria-live="polite">
          Loading...
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

  const navGroups = [
    {
      label: "WORK",
      items: [
        { to: "/appointments", icon: Clock01Icon, label: "Appointments" },
      ],
    },
    {
      label: "PEOPLE",
      items: [{ to: "/clients", icon: UserGroup02Icon, label: "Clients" }],
    },
    {
      label: "SETUP",
      items: [
        { to: "/calendars", icon: Calendar03Icon, label: "Calendars" },
        {
          to: "/appointment-types",
          icon: Layers01Icon,
          label: "Appointment Types",
        },
        { to: "/resources", icon: Package01Icon, label: "Resources" },
        { to: "/locations", icon: Location01Icon, label: "Locations" },
      ],
    },
    {
      label: "SYSTEM",
      items: [{ to: "/settings", icon: Settings01Icon, label: "Settings" }],
    },
  ];

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to Main Content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden border-r border-border/50 bg-sidebar lg:block lg:w-20 xl:w-64">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-border/50 px-3 xl:px-6">
            <Link
              to="/"
              preload="intent"
              className="mx-auto text-lg font-semibold tracking-tight xl:mx-0"
            >
              <span className="xl:hidden">S</span>
              <span className="hidden xl:inline">Scheduling</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-6 p-3 xl:p-5">
            {navGroups.map((group) => (
              <NavGroup key={group.label} label={group.label} compact>
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} icon={item.icon} compact>
                    {item.label}
                  </NavLink>
                ))}
              </NavGroup>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-border/50 p-3 xl:p-5">
            <div className="flex items-center justify-center gap-3 xl:justify-start">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="hidden flex-1 overflow-hidden xl:block">
                <div className="truncate text-sm font-medium">
                  {user?.name ?? user?.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void authClient.signOut()}
                title="Sign out"
                aria-label="Sign out"
              >
                <Icon icon={Logout01Icon} />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Header + Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-border/50 bg-sidebar px-5 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Icon icon={Menu01Icon} className="size-5" />
          </Button>
          <Link
            to="/"
            preload="intent"
            className="text-lg font-semibold tracking-tight"
          >
            Scheduling
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void authClient.signOut()}
            title="Sign out"
            aria-label="Sign out"
          >
            <Icon icon={Logout01Icon} />
          </Button>
        </header>

        {/* Main content */}
        <main id="main-content" className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Navigation Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-64 p-0 touch-manipulation overscroll-contain"
        >
          <SheetHeader className="border-b border-border/50 px-6 py-5">
            <div className="flex items-center justify-between">
              <SheetTitle>Scheduling</SheetTitle>
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                  <Icon icon={Cancel01Icon} />
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>
          <nav className="flex-1 space-y-6 p-5">
            {navGroups.map((group) => (
              <NavGroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <SheetClose key={item.to} asChild>
                    <NavLink to={item.to} icon={item.icon}>
                      {item.label}
                    </NavLink>
                  </SheetClose>
                ))}
              </NavGroup>
            ))}
          </nav>
          <div className="border-t border-border/50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">
                  {user?.name ?? user?.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">
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

function NavGroup({
  label,
  compact = false,
  children,
}: {
  label: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60",
          compact && "lg:hidden xl:block",
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NavLink({
  to,
  icon,
  compact = false,
  children,
}: {
  to: string;
  icon: React.ComponentProps<typeof Icon>["icon"];
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground",
        "transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        "[&.active]:bg-accent [&.active]:text-accent-foreground",
        compact && "justify-center xl:justify-start",
      )}
    >
      <Icon icon={icon} />
      <span className={cn(compact && "hidden xl:inline")}>{children}</span>
    </Link>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
