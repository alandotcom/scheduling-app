// Canonical appointment status colors and helpers
// Single source of truth for status visual encoding across all views.

import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "no_show";

export const APPOINTMENT_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
] as const satisfies readonly { value: AppointmentStatus; label: string }[];

/** Tailwind dot class (for filter pills, select items, calendar event status indicators) */
export const STATUS_DOT_CLASS: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-emerald-500",
  cancelled: "bg-slate-400",
  no_show: "bg-amber-500",
};

/** Badge variant mapping for Badge components */
export const STATUS_BADGE_VARIANT: Record<
  AppointmentStatus,
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>
> = {
  scheduled: "default",
  confirmed: "success",
  cancelled: "secondary",
  no_show: "warning",
};

/** CSS color values matching the Tailwind dot classes — for inline styles (calendar borders, etc.) */
export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  scheduled: "oklch(0.623 0.214 259)", // blue-500
  confirmed: "oklch(0.696 0.17 162.48)", // emerald-500
  cancelled: "oklch(0.554 0.022 257.42)", // slate-500
  no_show: "oklch(0.769 0.188 70.08)", // amber-500
};

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return APPOINTMENT_STATUS_OPTIONS.some((s) => s.value === value);
}

/** Safe badge variant lookup — returns "secondary" for unknown statuses */
export function getStatusBadgeVariant(
  status: string,
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  if (isAppointmentStatus(status)) {
    return STATUS_BADGE_VARIANT[status];
  }
  return "secondary";
}

export function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
