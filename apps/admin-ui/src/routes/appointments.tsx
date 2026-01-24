// Appointments list page - stub for future implementation

import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/contexts/auth'

function AppointmentsPage() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" />

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Appointments</h1>
      <p className="mt-2 text-muted-foreground">
        Manage appointments and bookings.
      </p>
      <div className="mt-8 rounded-lg border bg-card p-8 text-center text-muted-foreground">
        Appointments will be implemented in Step 11.
      </div>
    </div>
  )
}

export const Route = createFileRoute('/appointments')({
  component: AppointmentsPage,
})
