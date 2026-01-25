// Root route layout with navigation shell

import { useState } from "react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import {
  Calendar,
  Users,
  Clock,
  Settings,
  LogOut,
  MapPin,
  Package,
  Layers,
  Menu,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
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
    { to: "/", icon: <Calendar className="h-4 w-4" />, label: "Dashboard" },
    {
      to: "/appointments",
      icon: <Clock className="h-4 w-4" />,
      label: "Appointments",
    },
    {
      to: "/calendars",
      icon: <Calendar className="h-4 w-4" />,
      label: "Calendars",
    },
    {
      to: "/appointment-types",
      icon: <Layers className="h-4 w-4" />,
      label: "Appointment Types",
    },
    {
      to: "/locations",
      icon: <MapPin className="h-4 w-4" />,
      label: "Locations",
    },
    {
      to: "/resources",
      icon: <Package className="h-4 w-4" />,
      label: "Resources",
    },
    { to: "/clients", icon: <Users className="h-4 w-4" />, label: "Clients" },
    {
      to: "/settings",
      icon: <Settings className="h-4 w-4" />,
      label: "Settings",
    },
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
                <LogOut className="h-4 w-4" />
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
            <Menu className="h-5 w-5" />
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
            <LogOut className="h-4 w-4" />
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
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
