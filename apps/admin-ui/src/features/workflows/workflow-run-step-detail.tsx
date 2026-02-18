import type {
  JourneyRunDetailResponse,
  JourneyRunStepLog,
} from "@scheduling/dto";
import { formatDisplayDateTime } from "@/lib/date-utils";
import {
  formatCountdownDuration,
  isRecord,
  resolveStepLogWaitUntil,
  toJson,
  toNodeDetailEntries,
  toReasonCodeLabel,
  toStepLogDisplaySubtitle,
  toDisplayStepLogStatus,
} from "./workflow-runs-helpers";
import type { JourneyRun } from "@scheduling/dto";

interface WorkflowRunStepDetailProps {
  stepLog: JourneyRunStepLog;
  runStatus: JourneyRun["status"];
  triggerContext: JourneyRunDetailResponse["triggerContext"];
  isTriggerStep: boolean;
  nowMs: number;
}

export function WorkflowRunStepDetail({
  stepLog,
  runStatus,
  triggerContext,
  isTriggerStep,
  nowMs,
}: WorkflowRunStepDetailProps) {
  const displayStatus = toDisplayStepLogStatus({ stepLog, runStatus });
  const subtitle = toStepLogDisplaySubtitle({
    stepLog,
    displayStatus,
    nowMs,
  });

  const { inputEntries, outputEntries } = buildStepEntries({
    stepLog,
    isTriggerStep,
    triggerContext,
  });

  const waitUntil = resolveStepLogWaitUntil(stepLog);
  const waitUntilDate = waitUntil ? new Date(waitUntil) : null;
  const countdown =
    stepLog.nodeType === "wait" &&
    displayStatus === "running" &&
    waitUntilDate &&
    !Number.isNaN(waitUntilDate.getTime()) &&
    waitUntilDate.getTime() > nowMs
      ? formatCountdownDuration(waitUntilDate.getTime() - nowMs)
      : null;

  const rawInput = isTriggerStep
    ? (triggerContext?.payload ?? stepLog.input)
    : stepLog.input;

  return (
    <div className="ml-[7px] border-l border-border pl-5 pb-1">
      <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
        {subtitle ? (
          <p className="text-muted-foreground text-[11px]">{subtitle}</p>
        ) : null}

        {countdown ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            {countdown} remaining
          </p>
        ) : null}

        {inputEntries.length > 0 ? (
          <div className="space-y-1.5">
            <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
              Inputs
            </p>
            <div className="space-y-1">
              {inputEntries.map((entry) => (
                <div
                  className="flex items-start justify-between gap-2"
                  key={`input-${entry.key}`}
                >
                  <p className="text-muted-foreground">{entry.key}</p>
                  <p className="max-w-[65%] break-words text-right">
                    {entry.value}
                  </p>
                </div>
              ))}
            </div>
            <ViewRawDataToggle data={rawInput} label="View raw data" />
          </div>
        ) : null}

        {outputEntries.length > 0 ? (
          <div className="space-y-1.5">
            <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
              Outputs
            </p>
            <div className="space-y-1">
              {outputEntries.map((entry) => (
                <div
                  className="flex items-start justify-between gap-2"
                  key={`output-${entry.key}`}
                >
                  <p className="text-muted-foreground">{entry.key}</p>
                  <p className="max-w-[65%] break-words text-right">
                    {entry.value}
                  </p>
                </div>
              ))}
            </div>
            <ViewRawDataToggle data={stepLog.output} label="View raw data" />
          </div>
        ) : null}

        {stepLog.error ? (
          <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2">
            <p className="font-medium text-[11px] uppercase tracking-wide text-destructive">
              Error
            </p>
            <pre className="overflow-auto text-[11px]">{stepLog.error}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewRawDataToggle({ data, label }: { data: unknown; label: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
        {label} &rarr;
      </summary>
      <pre className="mt-1 overflow-auto rounded border bg-muted/30 p-2 text-[11px]">
        {toJson(data)}
      </pre>
    </details>
  );
}

type DetailEntry = { key: string; value: string };

const DELIVERY_NODE_TYPES = new Set([
  "logger",
  "send-resend",
  "send-resend-template",
  "send-slack",
]);

const UUID_PREFIX_RE = /^[0-9a-f]{8}-/;

function inferChannel(
  nodeType: string,
  input: Record<string, unknown> | null,
): string {
  if (input && typeof input["channel"] === "string") {
    return capitalize(input["channel"]);
  }
  switch (nodeType) {
    case "logger":
      return "Log";
    case "send-resend":
    case "send-resend-template":
      return "Email";
    case "send-slack":
      return "Slack";
    default:
      return capitalize(nodeType);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildStepEntries(input: {
  stepLog: JourneyRunStepLog;
  isTriggerStep: boolean;
  triggerContext: JourneyRunDetailResponse["triggerContext"];
}): { inputEntries: DetailEntry[]; outputEntries: DetailEntry[] } {
  const { stepLog, isTriggerStep, triggerContext } = input;

  // Trigger — already has custom rendering
  if (isTriggerStep) {
    return {
      inputEntries: buildTriggerInputEntries(triggerContext),
      outputEntries: [],
    };
  }

  const output = isRecord(stepLog.output) ? stepLog.output : null;
  const rawInput = isRecord(stepLog.input) ? stepLog.input : null;

  // Wait — show "Wait until" datetime
  if (stepLog.nodeType === "wait") {
    const waitUntil = resolveStepLogWaitUntil(stepLog);
    const outputEntries: DetailEntry[] = [];
    if (waitUntil) {
      const d = new Date(waitUntil);
      outputEntries.push({
        key: "Wait until",
        value: Number.isNaN(d.getTime())
          ? String(waitUntil)
          : formatDisplayDateTime(d),
      });
    }
    return { inputEntries: [], outputEntries };
  }

  // Condition — show matched result
  if (stepLog.nodeType === "condition") {
    const outputEntries: DetailEntry[] = [];
    if (output && typeof output["matched"] === "boolean") {
      outputEntries.push({
        key: "Result",
        value: output["matched"] ? "Matched" : "Did not match",
      });
    }
    return { inputEntries: [], outputEntries };
  }

  // Delivery nodes — curated channel/status/attempts
  if (DELIVERY_NODE_TYPES.has(stepLog.nodeType)) {
    const outputEntries: DetailEntry[] = [];
    outputEntries.push({
      key: "Channel",
      value: inferChannel(stepLog.nodeType, rawInput),
    });

    if (output) {
      const reasonCode =
        typeof output["reasonCode"] === "string" ? output["reasonCode"] : null;
      const reasonLabel = toReasonCodeLabel(reasonCode);
      if (reasonLabel) {
        outputEntries.push({ key: "Status", value: reasonLabel });
      } else if (typeof output["status"] === "string") {
        outputEntries.push({
          key: "Status",
          value: capitalize(output["status"]),
        });
      }

      const attempts =
        typeof output["attempts"] === "number" ? output["attempts"] : null;
      if (attempts !== null && attempts > 1) {
        outputEntries.push({ key: "Attempts", value: String(attempts) });
      }
    }

    return { inputEntries: [], outputEntries };
  }

  // Unknown — fall back to generic but filter out UUID-looking values
  const fallbackEntries = toNodeDetailEntries(output).filter(
    (e) => !UUID_PREFIX_RE.test(e.value),
  );
  return { inputEntries: [], outputEntries: fallbackEntries };
}

function buildTriggerInputEntries(
  triggerContext: JourneyRunDetailResponse["triggerContext"],
): Array<{ key: string; value: string }> {
  if (!triggerContext) {
    return [];
  }

  const entries: Array<{ key: string; value: string }> = [];

  if (triggerContext.appointment) {
    entries.push({
      key: "Appointment",
      value: formatDisplayDateTime(triggerContext.appointment.startAt),
    });
    entries.push({
      key: "Status",
      value:
        triggerContext.appointment.status.charAt(0).toUpperCase() +
        triggerContext.appointment.status.slice(1),
    });
  }

  if (triggerContext.client) {
    entries.push({
      key: "Client",
      value: `${triggerContext.client.firstName} ${triggerContext.client.lastName}`,
    });
    if (triggerContext.client.email) {
      entries.push({
        key: "Email",
        value: triggerContext.client.email,
      });
    }
  }

  return entries;
}
