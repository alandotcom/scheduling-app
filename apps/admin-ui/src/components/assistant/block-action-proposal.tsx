import type { ComponentProps } from "react";
import {
  Calendar02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import type { AssistantActionProposal } from "@scheduling/dto";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type IconType = ComponentProps<typeof Icon>["icon"];

interface ActionProposalBlockProps {
  proposal: AssistantActionProposal;
  isSubmitting: boolean;
  isExecuted: boolean;
  onConfirm: (proposal: AssistantActionProposal) => void;
  onDecline: (proposal: AssistantActionProposal) => void;
}

const ACTION_META: Record<
  string,
  { label: string; icon: IconType; destructive?: boolean }
> = {
  book: { label: "Book Appointment", icon: Calendar02Icon },
  reschedule: { label: "Reschedule Appointment", icon: Clock01Icon },
  confirm: { label: "Confirm Appointment", icon: CheckmarkCircle01Icon },
  cancel: {
    label: "Cancel Appointment",
    icon: Cancel01Icon,
    destructive: true,
  },
  no_show: {
    label: "Mark No-Show",
    icon: UserRemove01Icon,
    destructive: true,
  },
};

const PAYLOAD_LABELS: Record<string, string> = {
  clientName: "Client",
  calendarName: "Calendar",
  appointmentTypeName: "Type",
  currentStartTime: "Current Time",
  startTime: "Start Time",
  newStartTime: "New Start Time",
};

export function formatPayloadEntries(payload: Record<string, unknown>) {
  const HIDDEN_KEYS = new Set(["proposalId", "timezone"]);
  // Extract timezone from payload for formatting timestamps
  const timezone =
    typeof payload.timezone === "string" ? payload.timezone : undefined;
  const entries: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (HIDDEN_KEYS.has(key) || key === "id" || key.endsWith("Id")) continue;
    if (value == null) continue;
    const label =
      PAYLOAD_LABELS[key] ??
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
    let formatted: string;
    if (typeof value === "string") {
      // Detect ISO timestamp strings and format them
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const dt = timezone
          ? DateTime.fromISO(value, { zone: timezone })
          : DateTime.fromISO(value, { setZone: true });
        if (dt.isValid) {
          formatted = dt.toFormat("LLL d, yyyy 'at' h:mm a");
        } else {
          formatted = value;
        }
      } else {
        formatted = value;
      }
    } else if (typeof value === "number" || typeof value === "boolean")
      formatted = `${value}`;
    else formatted = JSON.stringify(value);
    entries.push({ label, value: formatted });
  }
  return entries;
}

export function ActionProposalBlock({
  proposal,
  isSubmitting,
  isExecuted,
  onConfirm,
  onDecline,
}: ActionProposalBlockProps) {
  const meta = ACTION_META[proposal.actionType] ?? {
    label: "Action Proposal",
    icon: Calendar02Icon,
  };
  const payload =
    typeof proposal.payload === "object" && proposal.payload !== null
      ? (proposal.payload as Record<string, unknown>)
      : {};
  const entries = formatPayloadEntries(payload);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        meta.destructive ? "border-destructive/25" : "border-border/70",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          meta.destructive ? "bg-destructive/5" : "bg-muted/40",
        )}
      >
        <Icon
          icon={meta.icon}
          className={cn(
            "size-4",
            meta.destructive ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className="text-xs font-semibold">{meta.label}</span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <p className="text-[13px] leading-relaxed">{proposal.summary}</p>

        {entries.length > 0 ? (
          <div className="space-y-1 rounded-md bg-muted/30 px-2.5 py-2 text-xs">
            {entries.map((entry) => (
              <div key={entry.label} className="flex gap-1.5">
                <span className="shrink-0 font-medium text-muted-foreground">
                  {entry.label}:
                </span>
                <span className="truncate font-mono text-foreground/80">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {!isExecuted ? (
          <div className="flex items-center justify-end gap-2 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDecline(proposal)}
              disabled={isSubmitting}
              className="text-muted-foreground"
            >
              Decline
            </Button>
            <Button
              type="button"
              size="sm"
              variant={meta.destructive ? "destructive" : "default"}
              onClick={() => onConfirm(proposal)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Running..." : "Confirm"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
