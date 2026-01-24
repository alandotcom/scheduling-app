// Root route layout with navigation shell

import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Calendar, Users, Clock, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth'
import { Button } from '@/components/ui/button'

function RootLayout() {
  const { user, isAuthenticated, logout, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link to="/" className="text-lg font-semibold">
              Scheduling
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            <NavLink to="/" icon={<Calendar className="h-4 w-4" />}>
              Dashboard
            </NavLink>
            <NavLink
              to="/appointments"
              icon={<Clock className="h-4 w-4" />}
            >
              Appointments
            </NavLink>
            <NavLink to="/calendars" icon={<Calendar className="h-4 w-4" />}>
              Calendars
            </NavLink>
            <NavLink to="/clients" icon={<Users className="h-4 w-4" />}>
              Clients
            </NavLink>
            <NavLink to="/settings" icon={<Settings className="h-4 w-4" />}>
              Settings
            </NavLink>
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? 'U'}
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
                onClick={() => void logout()}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Dev tools - only in development */}
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  )
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
    >
      {icon}
      {children}
    </Link>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
