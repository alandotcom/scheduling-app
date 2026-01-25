// Root route layout with navigation shell

import { useState } from "react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
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

function RootLayout() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const user = session?.user;
  const isAuthenticated = !!session;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground" role="status" aria-live="polite">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col">
        <Outlet />
      </div>
    );
  }

  const navItems = [
    { to: "/", icon: Calendar03Icon, label: "Dashboard" },
    { to: "/appointments", icon: Clock01Icon, label: "Appointments" },
    { to: "/calendars", icon: Calendar03Icon, label: "Calendars" },
    {
      to: "/appointment-types",
      icon: Layers01Icon,
      label: "Appointment Types",
    },
    { to: "/locations", icon: Location01Icon, label: "Locations" },
    { to: "/resources", icon: Package01Icon, label: "Resources" },
    { to: "/clients", icon: UserGroup02Icon, label: "Clients" },
    { to: "/settings", icon: Settings01Icon, label: "Settings" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar - hidden on mobile */}
      <aside className="hidden w-64 border-r bg-card md:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link to="/" className="text-lg font-semibold">
              Scheduling
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} icon={item.icon}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
              <Button
                variant="ghost"
                size="icon"
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
      <div className="flex flex-1 flex-col">
        {/* Mobile Header - visible only on mobile */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Icon icon={Menu01Icon} className="size-5" />
          </Button>
          <Link to="/" className="text-lg font-semibold">
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
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile Navigation Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Scheduling</SheetTitle>
          </SheetHeader>
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <SheetClose key={item.to} asChild>
                <NavLink to={item.to} icon={item.icon}>
                  {item.label}
                </NavLink>
              </SheetClose>
            ))}
          </nav>
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
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

      {/* Dev tools - only in development */}
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  );
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ComponentProps<typeof Icon>["icon"];
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
    >
      <Icon icon={icon} />
      {children}
    </Link>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
