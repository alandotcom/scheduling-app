import { type ReactElement, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  Alert01Icon,
  ArrowRight01Icon,
  Clock01Icon,
  Tick02Icon,
  WrenchIcon,
} from "@hugeicons/core-free-icons";
import {
  type AssistantAppointmentTableRow,
  type AssistantClientTableRow,
  assistantActionProposalSchema,
  assistantAppointmentTableRowSchema,
  assistantClientTableRowSchema,
} from "@scheduling/dto";
import { DateTime } from "luxon";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useSetCommandCenterOpen } from "@/hooks/use-command-center";
import { useProposalContext } from "./assistant-proposal-context";
import { ActionProposalBlock } from "./block-action-proposal";
import { ActionResultBlock } from "./block-action-result";
import {
  type AppointmentAction,
  AppointmentTableBlock,
} from "./block-appointment-table";
import { ClientTableBlock } from "./block-client-table";
import { useAppendSelection } from "./use-append-selection";

// ---------- Shared status renderers ----------

function SearchingIndicator() {
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary/50" />
      Searching...
    </div>
  );
}

function ToolError() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
      <Icon icon={Alert01Icon} className="size-3.5 shrink-0" />
      Something went wrong. Try again or rephrase your request.
    </div>
  );
}

// ---------- Schema helpers ----------

const clientRowsSchema = z.object({
  rows: z.array(assistantClientTableRowSchema),
});
const appointmentRowsSchema = z.object({
  rows: z.array(assistantAppointmentTableRowSchema),
});
const lookupRowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});
const availabilitySlotsSchema = z.object({
  availableCount: z.number(),
  calendarTimezone: z.string(),
  slots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      remainingCapacity: z.number(),
    }),
  ),
});
const toolProposalSchema = z.object({
  proposal: assistantActionProposalSchema,
});

// ---------- Status type ----------

type ToolStatus =
  | { readonly type: "running" }
  | { readonly type: "complete" }
  | { readonly type: "incomplete"; readonly reason: string }
  | { readonly type: "requires-action"; readonly reason: string };

// ---------- Factory for data tool UIs ----------

function renderToolStatus(
  status: ToolStatus,
  result: unknown,
  onComplete: (data: unknown) => ReactElement | null,
): ReactElement | null {
  if (status.type === "incomplete") return <ToolError />;
  if (status.type !== "complete") return <SearchingIndicator />;
  if (!result) return null;
  return onComplete(result);
}

// ---------- Interactive data tool result components ----------

function FindAppointmentTypesResult({ data }: { data: unknown }) {
  const { select, isRunning } = useAppendSelection();
  const parsed = lookupRowsSchema.safeParse(data);
  if (!parsed.success || parsed.data.rows.length === 0) return null;
  return (
    <LookupList
      rows={parsed.data.rows}
      onSelect={(row) => {
        const name = typeof row.name === "string" ? row.name : "this type";
        select(`I'll go with ${name}`);
      }}
      disabled={isRunning}
    />
  );
}

function FindCalendarsResult({ data }: { data: unknown }) {
  const { select, isRunning } = useAppendSelection();
  const parsed = lookupRowsSchema.safeParse(data);
  if (!parsed.success || parsed.data.rows.length === 0) return null;
  return (
    <LookupList
      rows={parsed.data.rows}
      onSelect={(row) => {
        const name = typeof row.name === "string" ? row.name : "this calendar";
        select(`I'll go with ${name}`);
      }}
      disabled={isRunning}
    />
  );
}

function GetAvailableSlotsResult({ data }: { data: unknown }) {
  const { select, isRunning } = useAppendSelection();
  const parsed = availabilitySlotsSchema.safeParse(data);
  if (!parsed.success) return null;
  const { calendarTimezone } = parsed.data;
  return (
    <SlotGrid
      slots={parsed.data.slots}
      timezone={calendarTimezone}
      onSelect={(slot) => {
        const dt = DateTime.fromISO(slot.start, { zone: calendarTimezone });
        const time = dt.toFormat("h:mm a");
        const date = dt.toFormat("ccc, LLL d");
        select(`I'd like the ${time} on ${date} slot (${slot.start})`);
      }}
      disabled={isRunning}
    />
  );
}

// ---------- Interactive data tool result components (clients/appointments) ----------

function FindClientsResult({ data }: { data: unknown }) {
  const { select, isRunning } = useAppendSelection();
  const parsed = clientRowsSchema.safeParse(data);
  if (!parsed.success) return null;
  const handleSelect = (row: AssistantClientTableRow) => {
    select(`I'll go with ${row.fullName}`);
  };
  // Only make rows interactive when there are multiple results to choose from.
  // A single result is auto-advanced by the AI, so clicks would just echo redundantly.
  const interactive = parsed.data.rows.length > 1;
  return (
    <ClientTableBlock
      rows={parsed.data.rows}
      onSelect={interactive ? handleSelect : undefined}
      disabled={isRunning}
    />
  );
}

function formatAppointmentLabel(row: AssistantAppointmentTableRow) {
  const dt = DateTime.fromISO(row.startAt, { zone: row.timezone });
  const time = dt.isValid ? dt.toFormat("LLL d, h:mm a") : row.startAt;
  let label = row.clientName;
  if (row.appointmentTypeName) label += `'s ${row.appointmentTypeName}`;
  label += ` on ${time}`;
  return label;
}

function useAppointmentAction() {
  const { select, isRunning } = useAppendSelection();
  const setOpen = useSetCommandCenterOpen();
  const navigate = useNavigate();

  const handleAction = (
    row: AssistantAppointmentTableRow,
    action: AppointmentAction,
  ) => {
    const label = formatAppointmentLabel(row);
    switch (action) {
      case "open":
        setOpen(false);
        navigate({ to: "/appointments", search: { selected: row.id } });
        break;
      case "reschedule":
        select(`Reschedule ${label}`);
        break;
      case "cancel":
        select(`Cancel ${label}`);
        break;
    }
  };

  return { handleAction, isRunning };
}

function FindAppointmentsResult({ data }: { data: unknown }) {
  const { handleAction, isRunning } = useAppointmentAction();
  const parsed = appointmentRowsSchema.safeParse(data);
  if (!parsed.success) return null;
  return (
    <AppointmentTableBlock
      rows={parsed.data.rows}
      onAction={handleAction}
      disabled={isRunning}
    />
  );
}

function GetAppointmentResult({ data }: { data: unknown }) {
  const { handleAction, isRunning } = useAppointmentAction();
  const parsed = appointmentRowsSchema.safeParse(data);
  if (!parsed.success) return null;
  return (
    <AppointmentTableBlock
      rows={parsed.data.rows}
      onAction={handleAction}
      disabled={isRunning}
    />
  );
}

// ---------- Data tool render components ----------

const FindClientsToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => <FindClientsResult data={data} />);

const FindAppointmentsToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => (
    <FindAppointmentsResult data={data} />
  ));

const GetAppointmentToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => (
    <GetAppointmentResult data={data} />
  ));

const FindCalendarsToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => (
    <FindCalendarsResult data={data} />
  ));

const FindAppointmentTypesToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => (
    <FindAppointmentTypesResult data={data} />
  ));

const GetAvailableSlotsToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) =>
  renderToolStatus(status, result, (data) => (
    <GetAvailableSlotsResult data={data} />
  ));

// ---------- Shared data renderers ----------

function lookupRowKey(row: Record<string, unknown>): string {
  if (typeof row.id === "string") return row.id;
  if (typeof row.name === "string") return row.name;
  return JSON.stringify(row);
}

/**
 * Whether a field should be hidden from display in the generic LookupList.
 * The LLM receives all fields (including IDs) for tool chaining, but users
 * should not see internal identifiers or technical config flags.
 */
function isInternalField(key: string, value: unknown): boolean {
  if (key === "id" || key.endsWith("Id")) return true;
  if (typeof value === "boolean") return true;
  return false;
}

/**
 * Fields that are useful to the model for tool chaining but add noise for a user
 * picking from the list (e.g. capacity on appointment types).
 */
const LOOKUP_HIDDEN_FIELDS = new Set(["capacity"]);

function formatLookupValue(key: string, value: unknown): string {
  if (key === "durationMin" && typeof value === "number") return `${value} min`;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Compact secondary line: non-name display fields joined into a subtitle. */
function lookupSecondary(row: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === "name" || value == null) continue;
    if (isInternalField(key, value) || LOOKUP_HIDDEN_FIELDS.has(key)) continue;
    parts.push(formatLookupValue(key, value));
  }
  return parts.join(" · ");
}

function LookupList({
  rows,
  onSelect,
  disabled,
}: {
  rows: Record<string, unknown>[];
  onSelect?: (row: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleClick = (row: Record<string, unknown>) => {
    if (disabled) return;
    const key = lookupRowKey(row);
    setSelectedId(key);
    onSelect?.(row);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="divide-y divide-border/50">
        {rows.map((row) => {
          const key = lookupRowKey(row);
          const isSelected = selectedId === key;
          const name = typeof row.name === "string" ? row.name : key;
          const secondary = lookupSecondary(row);

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => handleClick(row)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-xs",
                "transition-colors",
                isSelected
                  ? "border-l-2 border-l-primary bg-primary/10"
                  : "hover:bg-muted/50 active:bg-muted/70",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {name}
              </span>
              {secondary ? (
                <span className="shrink-0 truncate text-muted-foreground">
                  {secondary}
                </span>
              ) : null}
              {isSelected ? (
                <Icon
                  icon={Tick02Icon}
                  className="size-3.5 shrink-0 text-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function groupSlotsByDay(
  slots: { start: string; end: string; remainingCapacity: number }[],
  timezone: string,
) {
  const groups: Map<
    string,
    {
      label: string;
      slots: { start: string; end: string; remainingCapacity: number }[];
    }
  > = new Map();

  for (const slot of slots) {
    const dt = DateTime.fromISO(slot.start, { zone: timezone });
    const dateKey = dt.toISODate() ?? slot.start;
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        label: dt.toFormat("cccc, LLL d"),
        slots: [],
      });
    }
    groups.get(dateKey)!.slots.push(slot);
  }

  return [...groups.values()];
}

function SlotGrid({
  slots,
  timezone,
  onSelect,
  disabled,
}: {
  slots: { start: string; end: string; remainingCapacity: number }[];
  timezone: string;
  onSelect?: (slot: { start: string; end: string }) => void;
  disabled?: boolean;
}) {
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Icon icon={Clock01Icon} className="size-3.5 shrink-0" />
        No available slots found in this range.
      </div>
    );
  }

  const handleSlotClick = (slot: {
    start: string;
    end: string;
    remainingCapacity: number;
  }) => {
    if (disabled) return;
    setSelectedStart(slot.start);
    onSelect?.(slot);
  };

  const dayGroups = groupSlotsByDay(slots, timezone);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 p-2 space-y-2.5">
      {dayGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.slots.map((slot) => {
              const dt = DateTime.fromISO(slot.start, { zone: timezone });
              const time = dt.toFormat("h:mm a");
              const isSelected = selectedStart === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSlotClick(slot)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-semibold tabular-nums",
                    "transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background hover:border-primary/30 hover:bg-primary/5",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Proposal tool UIs ----------

function ProposalToolResult({ output }: { output: unknown }) {
  const {
    runningProposalId,
    proposalResults,
    onConfirmProposal,
    onDeclineProposal,
  } = useProposalContext();

  const parsed = toolProposalSchema.safeParse(output);
  if (!parsed.success) return null;

  const proposal = parsed.data.proposal;
  const result = proposalResults[proposal.proposalId];

  return (
    <div className="space-y-2">
      <ActionProposalBlock
        proposal={proposal}
        onConfirm={onConfirmProposal}
        onDecline={onDeclineProposal}
        isSubmitting={runningProposalId === proposal.proposalId}
        isExecuted={!!result}
      />
      {result ? <ActionResultBlock result={result} /> : null}
    </div>
  );
}

const ProposalToolRender: ToolCallMessagePartComponent = ({
  result,
  status,
}) => {
  if (status.type === "incomplete") return <ToolError />;
  if (status.type !== "complete") return <SearchingIndicator />;
  if (!result) return null;
  return <ProposalToolResult output={result} />;
};

// ---------- Generic fallback for unrecognized tool parts ----------

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * Renders any tool-call part that has no dedicated renderer in
 * `assistantToolRenderers`. Keeps the surface graceful if the model calls a tool
 * the UI doesn't know about (or a new tool is added server-side first): shows the
 * tool name + status, with collapsible raw input/output instead of leaking JSON
 * into the message body.
 */
export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  args,
  result,
  status,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning =
    status.type === "running" || status.type === "requires-action";
  const isError = status.type === "incomplete";
  const hasDetails =
    (args && Object.keys(args).length > 0) || result !== undefined;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 text-xs">
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          hasDetails && "transition-colors hover:bg-muted/40",
        )}
      >
        <Icon
          icon={isError ? Alert01Icon : WrenchIcon}
          className={cn(
            "size-3.5 shrink-0",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
          {humanizeToolName(toolName)}
        </span>
        {isRunning ? (
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary/50" />
        ) : null}
        {hasDetails ? (
          <Icon
            icon={ArrowRight01Icon}
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
              expanded && "rotate-90",
            )}
          />
        ) : null}
      </button>
      {expanded && hasDetails ? (
        <div className="space-y-2 border-t border-border/40 bg-muted/20 px-3 py-2.5">
          {args && Object.keys(args).length > 0 ? (
            <ToolJsonSection label="Input" value={args} />
          ) : null}
          {result !== undefined ? (
            <ToolJsonSection label="Output" value={result} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

function ToolJsonSection({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-md bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ---------- Tool renderer registry ----------

/**
 * Maps each tool name to its tool-call render component. Consumed by
 * `MessagePrimitive.Content`/`MessagePrimitive.Parts` via `tools.by_name`
 * to render tool-call message parts.
 */
export const assistantToolRenderers: Record<
  string,
  ToolCallMessagePartComponent
> = {
  findClients: FindClientsToolRender,
  findAppointments: FindAppointmentsToolRender,
  getAppointment: GetAppointmentToolRender,
  findCalendars: FindCalendarsToolRender,
  findAppointmentTypes: FindAppointmentTypesToolRender,
  getAvailableSlots: GetAvailableSlotsToolRender,
  proposeBookAppointment: ProposalToolRender,
  proposeRescheduleAppointment: ProposalToolRender,
  proposeConfirmAppointment: ProposalToolRender,
  proposeCancelAppointment: ProposalToolRender,
  proposeNoShowAppointment: ProposalToolRender,
};
