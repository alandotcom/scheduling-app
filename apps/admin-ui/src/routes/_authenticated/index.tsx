// Dashboard / Home page with real data

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Calendar03Icon,
  Add01Icon,
  ArrowRight02Icon,
  Alert02Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { AppointmentModal } from "@/components/appointment-modal";

function Dashboard() {
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  // Get today's date boundaries
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // Get week boundaries
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const endOfWeekStr = endOfWeek.toISOString().split("T")[0];

  // Fetch today's appointments
  const { data: todayAppointments } = useQuery(
    orpc.appointments.list.queryOptions({
      input: {
        startDate: todayStr,
        endDate: todayStr,
        limit: 50,
      },
    }),
  );

  // Fetch this week's appointments
  const { data: weekAppointments } = useQuery(
    orpc.appointments.list.queryOptions({
      input: {
        startDate: todayStr,
        endDate: endOfWeekStr,
        limit: 100,
      },
    }),
  );

  // Fetch all clients
  const { data: clients } = useQuery(
    orpc.clients.list.queryOptions({
      input: { limit: 1 },
    }),
  );

  // Fetch calendars
  const { data: calendars } = useQuery(
    orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Calculate stats
  const todayCount = todayAppointments?.items.length ?? 0;
  const weekCount = weekAppointments?.items.length ?? 0;
  const clientCount = clients?.items.length ?? 0;
  const calendarCount = calendars?.items.length ?? 0;

  // Get today's appointments sorted by time
  const todayItems = (todayAppointments?.items ?? []).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  // Get scheduled appointments (not yet confirmed)
  const pendingAppointments =
    weekAppointments?.items.filter((apt) => apt.status === "scheduled") ?? [];

  // Get no-shows from this week
  const noShows =
    weekAppointments?.items.filter((apt) => apt.status === "no_show") ?? [];

  const formatTime = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const hasAlerts = pendingAppointments.length > 0 || noShows.length > 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Button onClick={() => setAppointmentModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Appointment
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Today"
          value={todayCount.toString()}
          subtitle="appointments"
          href="/appointments"
        />
        <DashboardCard
          title="This Week"
          value={weekCount.toString()}
          subtitle="appointments"
          href="/appointments"
        />
        <DashboardCard
          title="Clients"
          value={clientCount.toString()}
          subtitle="total"
          href="/clients"
        />
        <DashboardCard
          title="Calendars"
          value={calendarCount.toString()}
          subtitle="active"
          href="/calendars"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Today's Schedule */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Today's Schedule
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/appointments" search={{}}>
                View all
                <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          {todayItems.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center shadow-sm">
              <Icon
                icon={Calendar03Icon}
                className="mx-auto size-10 text-muted-foreground/50"
              />
              <p className="mt-3 text-muted-foreground">
                No appointments scheduled for today
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setAppointmentModalOpen(true)}
              >
                <Icon icon={Add01Icon} data-icon="inline-start" />
                Book an appointment
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm divide-y divide-border/50">
              {todayItems.map((apt) => (
                <Link
                  key={apt.id}
                  to="/appointments"
                  search={{}}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium w-20">
                      {formatTime(apt.startAt)}
                    </div>
                    <div>
                      <div className="font-medium">
                        {apt.client
                          ? `${apt.client.firstName} ${apt.client.lastName}`
                          : "No client"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {apt.appointmentType?.name}
                        {apt.calendar && ` - ${apt.calendar.name}`}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={
                      apt.status === "confirmed"
                        ? "success"
                        : apt.status === "cancelled" || apt.status === "no_show"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {apt.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Needs Attention */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-4">
            Needs Attention
          </h2>
          {!hasAlerts ? (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center shadow-sm">
              <Icon
                icon={CheckmarkCircle01Icon}
                className="mx-auto size-10 text-green-500/50"
              />
              <p className="mt-3 text-muted-foreground">
                Everything looks good! No items need attention.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingAppointments.length > 0 && (
                <AlertCard
                  icon={Clock01Icon}
                  title={`${pendingAppointments.length} appointment${pendingAppointments.length === 1 ? "" : "s"} pending confirmation`}
                  href="/appointments"
                  variant="warning"
                />
              )}
              {noShows.length > 0 && (
                <AlertCard
                  icon={Alert02Icon}
                  title={`${noShows.length} no-show${noShows.length === 1 ? "" : "s"} this week`}
                  href="/appointments"
                  variant="destructive"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Appointment Modal */}
      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
      />
    </div>
  );
}

interface DashboardCardProps {
  title: string;
  value: string;
  subtitle: string;
  href: string;
}

function DashboardCard({ title, value, subtitle, href }: DashboardCardProps) {
  return (
    <Link
      to={href}
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-border"
    >
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        <span className="text-sm text-muted-foreground">{subtitle}</span>
      </div>
    </Link>
  );
}

interface AlertCardProps {
  icon: IconSvgElement;
  title: string;
  href: string;
  variant: "warning" | "destructive";
}

function AlertCard({ icon, title, href, variant }: AlertCardProps) {
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-sm",
        variant === "warning" &&
          "border-yellow-500/50 bg-yellow-500/5 hover:bg-yellow-500/10",
        variant === "destructive" &&
          "border-destructive/50 bg-destructive/5 hover:bg-destructive/10",
      )}
    >
      <Icon
        icon={icon}
        className={cn(
          "size-5",
          variant === "warning" && "text-yellow-600",
          variant === "destructive" && "text-destructive",
        )}
      />
      <span className="text-sm font-medium">{title}</span>
      <Icon
        icon={ArrowRight02Icon}
        className="ml-auto size-4 text-muted-foreground"
      />
    </Link>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});
