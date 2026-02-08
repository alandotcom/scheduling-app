// Dashboard / Home page with real data

import { useState } from "react";
import { DateTime } from "luxon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IconSvgElement } from "@hugeicons/react";
import type {
  AppointmentWithRelations,
  DashboardSummary,
} from "@scheduling/dto";
import {
  Calendar03Icon,
  Add01Icon,
  ArrowRight02Icon,
  Alert02Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { formatTimeDisplay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { AppointmentModal } from "@/components/appointment-modal";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function getDashboardStats(summary: DashboardSummary | undefined) {
  return {
    todayCount: summary?.todayAppointments ?? 0,
    weekCount: summary?.weekAppointments ?? 0,
    clientCount: summary?.clients ?? 0,
    calendarCount: summary?.calendars ?? 0,
  };
}

export function getAttentionCounts(summary: DashboardSummary | undefined) {
  return {
    pendingAppointments: summary?.pendingAppointments ?? 0,
    noShows: summary?.noShows ?? 0,
  };
}

export function getSortedTodayAppointments(
  appointments: AppointmentWithRelations[] | undefined,
) {
  const toMillis = (value: string | Date) =>
    (typeof value === "string"
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value)
    ).toMillis();

  return (appointments ?? []).toSorted(
    (a, b) => toMillis(a.startAt) - toMillis(b.startAt),
  );
}

export function Dashboard() {
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: () => setAppointmentModalOpen(true),
        description: "Create appointment",
      },
    ],
  });

  // Get today's date boundaries
  const today = DateTime.now().startOf("day");
  const todayStr = today.toISODate() ?? "";

  // Fetch dashboard summary metrics
  const { data: summary } = useQuery(orpc.dashboard.summary.queryOptions());

  // Fetch today's appointments for schedule list
  const { data: todayAppointments } = useQuery(
    orpc.appointments.list.queryOptions({
      input: {
        startDate: todayStr,
        endDate: todayStr,
        limit: 50,
      },
    }),
  );

  const { todayCount, weekCount, clientCount, calendarCount } =
    getDashboardStats(summary);
  const todayItems = getSortedTodayAppointments(todayAppointments?.items);

  const { pendingAppointments, noShows } = getAttentionCounts(summary);
  const hasAlerts = pendingAppointments > 0 || noShows > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {today.toLocaleString({
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Button onClick={() => setAppointmentModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">New Appointment</span>
          <span className="sm:hidden">New</span>
          <ShortcutBadge shortcut="c" className="ml-2 hidden sm:inline-flex" />
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
              {"Today's Schedule"}
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/appointments" search={{}}>
                View all
                <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          {todayItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Icon
                icon={Calendar03Icon}
                className="mx-auto size-10 text-muted-foreground/40"
              />
              <p className="mt-3 text-sm text-muted-foreground">
                No appointments scheduled for today
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setAppointmentModalOpen(true)}
              >
                <Icon icon={Add01Icon} data-icon="inline-start" />
                Book an appointment
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {todayItems.map((apt) => (
                <Link
                  key={apt.id}
                  to="/appointments"
                  search={{}}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium tabular-nums w-20 text-muted-foreground">
                      {formatTimeDisplay(apt.startAt)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {apt.client
                          ? `${apt.client.firstName} ${apt.client.lastName}`
                          : "No client"}
                      </div>
                      <div className="text-xs text-muted-foreground">
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
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Icon
                icon={CheckmarkCircle01Icon}
                className="mx-auto size-10 text-muted-foreground/30"
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Everything looks good! No items need attention.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingAppointments > 0 && (
                <AlertCard
                  icon={Clock01Icon}
                  title={`${pendingAppointments} appointment${pendingAppointments === 1 ? "" : "s"} pending confirmation`}
                  href="/appointments"
                  variant="warning"
                />
              )}
              {noShows > 0 && (
                <AlertCard
                  icon={Alert02Icon}
                  title={`${noShows} no-show${noShows === 1 ? "" : "s"} this week`}
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
      className="rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/15 hover:shadow-sm"
    >
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
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
