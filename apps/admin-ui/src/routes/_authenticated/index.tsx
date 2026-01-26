// Dashboard / Home page

import { createFileRoute } from "@tanstack/react-router";

function Dashboard() {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-muted-foreground">
        Welcome to the scheduling admin dashboard.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard title="Today's Appointments" value="0" />
        <DashboardCard title="This Week" value="0" />
        <DashboardCard title="Total Clients" value="0" />
        <DashboardCard title="Active Calendars" value="0" />
      </div>
    </div>
  );
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-sm font-medium tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-3 text-4xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});
