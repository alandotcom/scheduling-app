// Dashboard / Home page

import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/contexts/auth'

function Dashboard() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome to the scheduling admin dashboard.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard title="Today's Appointments" value="0" />
        <DashboardCard title="This Week" value="0" />
        <DashboardCard title="Total Clients" value="0" />
        <DashboardCard title="Active Calendars" value="0" />
      </div>
    </div>
  )
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Dashboard,
})
