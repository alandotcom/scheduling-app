// Calendars management page - stub for future implementation

import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/contexts/auth'

function CalendarsPage() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" />

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Calendars</h1>
      <p className="mt-2 text-muted-foreground">
        Manage calendars and availability.
      </p>
      <div className="mt-8 rounded-lg border bg-card p-8 text-center text-muted-foreground">
        Calendars will be implemented in Step 8.
      </div>
    </div>
  )
}

export const Route = createFileRoute('/calendars')({
  component: CalendarsPage,
})
