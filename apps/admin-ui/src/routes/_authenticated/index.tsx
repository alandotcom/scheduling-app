// Dashboard / Home page with real data

import { useCallback, useState } from "react";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/lib/appointment-status";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { LazyAppointmentModal as AppointmentModal } from "@/components/lazy-appointment-modal";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";

export function shouldEnableDashboardQueries(
  activeOrganizationId: string | null | undefined,
) {
  return !!activeOrganizationId;
}

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

function toMillis(value: string | Date) {
  return (
    typeof value === "string"
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value)
  ).toMillis();
}

export function getSortedTodayAppointments(
  appointments: AppointmentWithRelations[] | undefined,
) {
  return (appointments ?? []).toSorted(
    (a, b) => toMillis(a.startAt) - toMillis(b.startAt),
  );
}

export function Dashboard() {
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: session } = authClient.useSession();
  const hasActiveOrganization = shouldEnableDashboardQueries(
    session?.session.activeOrganizationId,
  );

  const handleAppointmentCreated = useCallback(
    (appointmentId: string) => {
      navigate({
        to: "/appointments",
        search: {
          selected: appointmentId,
          tab: "details",
        },
      });
    },
    [navigate],
  );

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: () => setAppointmentModalOpen(true),
        description: "Create appointment",
      },
    ],
  });

  const today = DateTime.now().startOf("day");
  const todayStr = today.toISODate() ?? "";
  const todayLabel = today.toFormat("cccc, LLL d");

  // Dashboard summary metrics (stat ribbon + attention counts)
  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    ...orpc.dashboard.summary.queryOptions(),
    enabled: hasActiveOrganization,
  });

  // Today's appointments for the schedule hero
  const {
    data: todayAppointments,
    isLoading: isTodayLoading,
    isError: isTodayError,
    refetch: refetchToday,
  } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        startDate: todayStr,
        endDate: todayStr,
        limit: 50,
      },
    }),
    enabled: hasActiveOrganization,
  });

  const { todayCount, weekCount, clientCount, calendarCount } =
    getDashboardStats(summary);
  const todayItems = getSortedTodayAppointments(todayAppointments?.items);

  const { pendingAppointments, noShows } = getAttentionCounts(summary);
  const hasAlerts = pendingAppointments > 0 || noShows > 0;

  return (
    <PageScaffold className="pb-24 lg:pb-6">
      {/* Stat ribbon — quiet pulse, demoted from hero tiles */}
      {isSummaryError ? (
        <RetryPanel
          className="mt-6"
          message="Couldn't load your dashboard metrics."
          onRetry={() => {
            void refetchSummary();
          }}
        />
      ) : isSummaryLoading ? (
        <StatRibbonSkeleton />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          <StatItem value={todayCount} label="Today" href="/appointments" />
          <StatItem value={weekCount} label="This week" href="/appointments" />
          <StatItem value={clientCount} label="Clients" href="/clients" />
          <StatItem value={calendarCount} label="Calendars" href="/calendars" />
        </div>
      )}

      {/* Hero: Today's Schedule (2/3) + Needs Attention (1/3) */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Today's Schedule — the lead */}
        <section className="lg:col-span-2">
          <div className="mb-4 flex h-8 items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">
                {"Today's Schedule"}
              </h2>
              <span className="text-sm text-muted-foreground">
                {todayLabel}
              </span>
            </div>
            <Link
              to="/appointments"
              search={{}}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View all
              <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
            </Link>
          </div>

          {isTodayError ? (
            <RetryPanel
              message="Couldn't load today's appointments."
              onRetry={() => {
                void refetchToday();
              }}
            />
          ) : isTodayLoading ? (
            <ScheduleSkeleton />
          ) : todayItems.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
              <Icon
                icon={Calendar03Icon}
                className="size-9 text-muted-foreground/40"
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
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {todayItems.map((apt) => (
                <Link
                  key={apt.id}
                  to="/appointments"
                  search={{}}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-16 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                      {formatTimeDisplay(apt.startAt)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {apt.client.firstName} {apt.client.lastName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {apt.appointmentType?.name}
                        {apt.calendar && ` · ${apt.calendar.name}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant={getStatusBadgeVariant(apt.status)}>
                    {formatStatusLabel(apt.status)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Needs Attention — sidebar */}
        <section className="lg:col-span-1">
          <div className="mb-4 flex h-8 items-center">
            <h2 className="text-lg font-semibold tracking-tight">
              Needs Attention
            </h2>
          </div>

          {isSummaryError ? (
            <RetryPanel
              message="Couldn't load alerts."
              onRetry={() => {
                void refetchSummary();
              }}
            />
          ) : isSummaryLoading ? (
            <Skeleton className="h-[4.5rem] w-full rounded-xl" />
          ) : hasAlerts ? (
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
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <Icon
                icon={CheckmarkCircle01Icon}
                className="size-7 text-emerald-500/60"
              />
              <p className="text-sm text-muted-foreground">
                All clear. Nothing needs attention.
              </p>
            </div>
          )}
        </section>
      </div>

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
        onCreated={handleAppointmentCreated}
      />

      <MobileActionBar>
        <Button
          className="w-full"
          onClick={() => setAppointmentModalOpen(true)}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Appointment
        </Button>
      </MobileActionBar>
    </PageScaffold>
  );
}

interface StatItemProps {
  value: number;
  label: string;
  href: string;
}

function StatItem({ value, label, href }: StatItemProps) {
  return (
    <Link
      to={href}
      className="flex items-baseline gap-2 bg-card px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <span className="text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </span>
      <span className="truncate text-sm text-muted-foreground">{label}</span>
    </Link>
  );
}

interface RetryPanelProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

function RetryPanel({ message, onRetry, className }: RetryPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center",
        className,
      )}
    >
      <Icon icon={Alert02Icon} className="size-7 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function StatRibbonSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-baseline gap-2 bg-card px-4 py-3.5">
          <Skeleton className="h-7 w-8" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="min-h-56 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-14 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
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
        "flex items-center gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
        variant === "warning" &&
          "border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/15",
        variant === "destructive" &&
          "border-destructive/25 bg-destructive/10 hover:bg-destructive/15",
      )}
    >
      <Icon
        icon={icon}
        className={cn(
          "size-5 shrink-0",
          variant === "warning" && "text-amber-600 dark:text-amber-400",
          variant === "destructive" && "text-destructive",
        )}
      />
      <span className="text-sm font-medium">{title}</span>
      <Icon
        icon={ArrowRight02Icon}
        className="ml-auto size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});
