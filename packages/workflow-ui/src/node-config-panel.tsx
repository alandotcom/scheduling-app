// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WebhookEventType,
  WorkflowActionCatalogItem,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGuardCondition,
} from "@scheduling/dto";
import { ActionConfigRenderer } from "./action-config-renderer";
import {
  GUARD_OPERATORS,
  createDefaultGuardCondition,
  formatDurationMsAsIso8601,
  formatGuardValueInput,
  formatAbsoluteDateTime,
  getPathValue,
  humanizeDuration,
  isGuardOperator,
  operatorNeedsValue,
  parseGuardValueInput,
  parseInputJson,
  parseWorkflowDurationToMs,
  toTimestamp,
  type CanvasGraphNode,
  type WorkflowBuilderNode,
} from "./utils";

type NodeConfigPanelProps = {
  selectedGraphNode: CanvasGraphNode | null;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  availableTriggerEventTypes: readonly WebhookEventType[];
  onTriggerEventTypeChange: (eventType: WebhookEventType) => void;
  graphNodes: WorkflowGraphNode[];
  graphEdges: WorkflowGraphEdge[];
  readOnly: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
};

export function NodeConfigPanel({
  selectedGraphNode,
  actionCatalog,
  availableTriggerEventTypes,
  onTriggerEventTypeChange,
  graphNodes,
  graphEdges,
  readOnly,
  updateSelectedNode,
}: NodeConfigPanelProps) {
  const [inputJsonDraft, setInputJsonDraft] = useState("");
  const [inputJsonError, setInputJsonError] = useState<string | null>(null);
  const [waitDurationDraft, setWaitDurationDraft] = useState("");
  const [waitDurationError, setWaitDurationError] = useState<string | null>(
    null,
  );
  const [samplePayloadDraft, setSamplePayloadDraft] = useState("{}");
  const [samplePayloadError, setSamplePayloadError] = useState<string | null>(
    null,
  );
  const [samplePayload, setSamplePayload] = useState<Record<
    string,
    unknown
  > | null>(null);

  useEffect(() => {
    if (!selectedGraphNode) {
      setInputJsonDraft("");
      setInputJsonError(null);
      return;
    }
    if (selectedGraphNode.kind !== "action") {
      setInputJsonDraft("");
      setInputJsonError(null);
      return;
    }
    setInputJsonDraft(JSON.stringify(selectedGraphNode.input ?? {}, null, 2));
    setInputJsonError(null);
  }, [selectedGraphNode]);

  useEffect(() => {
    if (!selectedGraphNode || selectedGraphNode.kind !== "wait") {
      setWaitDurationDraft("");
      setWaitDurationError(null);
      return;
    }
    setWaitDurationDraft(selectedGraphNode.wait.duration);
    setWaitDurationError(null);
  }, [selectedGraphNode?.id]);

  const parsedWaitDurationMs = useMemo(
    () => parseWorkflowDurationToMs(waitDurationDraft),
    [waitDurationDraft],
  );

  const waitDurationSummary = useMemo(() => {
    if (parsedWaitDurationMs === null) return null;
    return {
      durationMs: parsedWaitDurationMs,
      humanLabel: humanizeDuration(parsedWaitDurationMs),
      iso8601: formatDurationMsAsIso8601(parsedWaitDurationMs),
    };
  }, [parsedWaitDurationMs]);

  const waitReferencePreview = useMemo(() => {
    if (!selectedGraphNode || selectedGraphNode.kind !== "wait") return null;
    if (!selectedGraphNode.wait.referenceField || !waitDurationSummary) {
      return null;
    }
    if (!samplePayload) {
      return { error: "Add an example trigger payload to preview this wait." };
    }
    const referenceValue = getPathValue(
      samplePayload,
      selectedGraphNode.wait.referenceField,
    );
    if (referenceValue === undefined) {
      return {
        error: `Could not resolve '${selectedGraphNode.wait.referenceField}' in the sample payload.`,
      };
    }
    const referenceMs = toTimestamp(referenceValue);
    if (referenceMs === null) {
      return {
        error: `Resolved reference value is not a valid date/time: ${JSON.stringify(referenceValue)}`,
      };
    }
    const scheduledMs =
      selectedGraphNode.wait.offsetDirection === "before"
        ? referenceMs - waitDurationSummary.durationMs
        : referenceMs + waitDurationSummary.durationMs;
    return {
      referenceDate: formatAbsoluteDateTime(referenceMs),
      scheduledDate: formatAbsoluteDateTime(scheduledMs),
    };
  }, [samplePayload, selectedGraphNode, waitDurationSummary]);

  const isAvailableTriggerEventType = useCallback(
    (value: string): value is WebhookEventType =>
      availableTriggerEventTypes.some((t) => t === value),
    [availableTriggerEventTypes],
  );

  if (!selectedGraphNode) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a node to edit its configuration.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Node ID</p>
        <p className="font-mono text-xs">{selectedGraphNode.id}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Kind</p>
        <p className="text-sm">{selectedGraphNode.kind}</p>
      </div>

      {selectedGraphNode.kind === "trigger" ? (
        <TriggerConfig
          eventType={selectedGraphNode.eventType}
          availableEventTypes={availableTriggerEventTypes}
          isAvailableTriggerEventType={isAvailableTriggerEventType}
          onTriggerEventTypeChange={onTriggerEventTypeChange}
          samplePayloadDraft={samplePayloadDraft}
          setSamplePayloadDraft={setSamplePayloadDraft}
          samplePayloadError={samplePayloadError}
          setSamplePayloadError={setSamplePayloadError}
          setSamplePayload={setSamplePayload}
          readOnly={readOnly}
        />
      ) : null}

      {selectedGraphNode.kind === "action" ? (
        <ActionConfig
          graphNode={selectedGraphNode}
          actionCatalog={actionCatalog}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          inputJsonDraft={inputJsonDraft}
          setInputJsonDraft={setInputJsonDraft}
          inputJsonError={inputJsonError}
          setInputJsonError={setInputJsonError}
          readOnly={readOnly}
          updateSelectedNode={updateSelectedNode}
        />
      ) : null}

      {selectedGraphNode.kind === "wait" ? (
        <WaitConfig
          graphNode={selectedGraphNode}
          waitDurationDraft={waitDurationDraft}
          setWaitDurationDraft={setWaitDurationDraft}
          waitDurationError={waitDurationError}
          setWaitDurationError={setWaitDurationError}
          waitDurationSummary={waitDurationSummary}
          waitReferencePreview={waitReferencePreview}
          readOnly={readOnly}
          updateSelectedNode={updateSelectedNode}
        />
      ) : null}

      {selectedGraphNode.kind === "terminal" ? (
        <TerminalConfig
          graphNode={selectedGraphNode}
          readOnly={readOnly}
          updateSelectedNode={updateSelectedNode}
        />
      ) : null}

      {selectedGraphNode.kind === "condition" ? (
        <ConditionConfig
          graphNode={selectedGraphNode}
          readOnly={readOnly}
          updateSelectedNode={updateSelectedNode}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger config
// ---------------------------------------------------------------------------

function TriggerConfig({
  eventType,
  availableEventTypes,
  isAvailableTriggerEventType,
  onTriggerEventTypeChange,
  samplePayloadDraft,
  setSamplePayloadDraft,
  samplePayloadError,
  setSamplePayloadError,
  setSamplePayload,
  readOnly,
}: {
  eventType: WebhookEventType;
  availableEventTypes: readonly WebhookEventType[];
  isAvailableTriggerEventType: (v: string) => v is WebhookEventType;
  onTriggerEventTypeChange: (et: WebhookEventType) => void;
  samplePayloadDraft: string;
  setSamplePayloadDraft: (v: string) => void;
  samplePayloadError: string | null;
  setSamplePayloadError: (v: string | null) => void;
  setSamplePayload: (v: Record<string, unknown> | null) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        Trigger Event
      </label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={eventType}
        disabled={readOnly}
        onChange={(event) => {
          const next = event.target.value;
          if (!isAvailableTriggerEventType(next)) return;
          onTriggerEventTypeChange(next);
        }}
      >
        {availableEventTypes.map((et) => (
          <option key={et} value={et}>
            {et}
          </option>
        ))}
      </select>

      <label className="block text-xs text-muted-foreground">
        Example Payload (JSON, optional)
      </label>
      <textarea
        className="min-h-[140px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
        value={samplePayloadDraft}
        disabled={readOnly}
        onChange={(e) => {
          setSamplePayloadDraft(e.target.value);
          setSamplePayloadError(null);
        }}
        onBlur={() => {
          const trimmed = samplePayloadDraft.trim();
          if (trimmed.length === 0) {
            setSamplePayload(null);
            setSamplePayloadError(null);
            return;
          }
          const parsed = parseInputJson(trimmed);
          if (!parsed) {
            setSamplePayloadError("Example payload must be a JSON object.");
            return;
          }
          setSamplePayload(parsed);
          setSamplePayloadError(null);
        }}
      />
      {samplePayloadError ? (
        <p className="text-xs text-destructive">{samplePayloadError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Used for wait-date previews when a reference field is set.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action config
// ---------------------------------------------------------------------------

function ActionConfig({
  graphNode,
  actionCatalog,
  graphNodes,
  graphEdges,
  inputJsonDraft,
  setInputJsonDraft,
  inputJsonError,
  setInputJsonError,
  readOnly,
  updateSelectedNode,
}: {
  graphNode: WorkflowBuilderNode & { kind: "action" };
  actionCatalog: readonly WorkflowActionCatalogItem[];
  graphNodes: WorkflowGraphNode[];
  graphEdges: WorkflowGraphEdge[];
  inputJsonDraft: string;
  setInputJsonDraft: (v: string) => void;
  inputJsonError: string | null;
  setInputJsonError: (v: string | null) => void;
  readOnly: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  const catalogItem = actionCatalog.find((a) => a.id === graphNode.actionId);
  const configFields = catalogItem?.configFields;

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">Action</label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={graphNode.actionId}
        disabled={readOnly}
        onChange={(event) => {
          const action = actionCatalog.find(
            (item) => item.id === event.target.value,
          );
          if (!action) return;
          updateSelectedNode((node) => {
            if (node.kind !== "action") return node;
            return {
              ...node,
              actionId: action.id,
              integrationKey: action.integrationKey,
            };
          });
        }}
      >
        {actionCatalog.map((action) => (
          <option key={action.id} value={action.id}>
            {action.label}
          </option>
        ))}
      </select>

      {configFields && configFields.length > 0 ? (
        <>
          <label className="block text-xs text-muted-foreground">
            Configuration
          </label>
          <ActionConfigRenderer
            configFields={configFields}
            values={graphNode.input ?? {}}
            onChange={(nextValues) =>
              updateSelectedNode((node) => {
                if (node.kind !== "action") return node;
                return { ...node, input: nextValues };
              })
            }
            disabled={readOnly}
            nodes={graphNodes}
            edges={graphEdges}
            currentNodeId={graphNode.id}
            actionCatalog={actionCatalog}
          />
        </>
      ) : (
        <>
          <label className="block text-xs text-muted-foreground">
            Input (JSON)
          </label>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            value={inputJsonDraft}
            disabled={readOnly}
            onChange={(event) => {
              setInputJsonDraft(event.target.value);
              setInputJsonError(null);
            }}
            onBlur={() => {
              const parsed = parseInputJson(inputJsonDraft);
              if (!parsed) {
                setInputJsonError("Input must be a JSON object.");
                return;
              }
              updateSelectedNode((node) => {
                if (node.kind !== "action") return node;
                return { ...node, input: parsed };
              });
              setInputJsonError(null);
            }}
          />
          {inputJsonError ? (
            <p className="text-xs text-destructive">{inputJsonError}</p>
          ) : null}
        </>
      )}

      <GuardEditor
        guard={graphNode.guard}
        readOnly={readOnly}
        nodeKind="action"
        nodeId={graphNode.id}
        updateSelectedNode={updateSelectedNode}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wait config
// ---------------------------------------------------------------------------

function WaitConfig({
  graphNode,
  waitDurationDraft,
  setWaitDurationDraft,
  waitDurationError,
  setWaitDurationError,
  waitDurationSummary,
  waitReferencePreview,
  readOnly,
  updateSelectedNode,
}: {
  graphNode: WorkflowBuilderNode & { kind: "wait" };
  waitDurationDraft: string;
  setWaitDurationDraft: (v: string) => void;
  waitDurationError: string | null;
  setWaitDurationError: (v: string | null) => void;
  waitDurationSummary: {
    durationMs: number;
    humanLabel: string;
    iso8601: string;
  } | null;
  waitReferencePreview:
    | { error: string }
    | { referenceDate: string; scheduledDate: string }
    | null;
  readOnly: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">Duration</label>
      <input
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={waitDurationDraft}
        disabled={readOnly}
        placeholder="30d, 12h, PT30M"
        onChange={(event) => {
          setWaitDurationDraft(event.target.value);
          setWaitDurationError(null);
        }}
        onBlur={() => {
          const durationMs = parseWorkflowDurationToMs(waitDurationDraft);
          if (durationMs === null) {
            setWaitDurationError("Enter a valid duration like 30d or PT30M.");
            return;
          }
          const canonicalIso = formatDurationMsAsIso8601(durationMs);
          updateSelectedNode((node) => {
            if (node.kind !== "wait") return node;
            return { ...node, wait: { ...node.wait, duration: canonicalIso } };
          });
          setWaitDurationDraft(canonicalIso);
          setWaitDurationError(null);
        }}
      />
      {waitDurationError ? (
        <p className="text-xs text-destructive">{waitDurationError}</p>
      ) : null}
      {waitDurationSummary ? (
        <p className="text-xs text-muted-foreground">
          Parsed as {waitDurationSummary.humanLabel} (
          {waitDurationSummary.iso8601})
        </p>
      ) : null}

      <label className="block text-xs text-muted-foreground">
        Reference Field (optional)
      </label>
      <input
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={graphNode.wait.referenceField ?? ""}
        disabled={readOnly}
        onChange={(event) =>
          updateSelectedNode((node) => {
            if (node.kind !== "wait") return node;
            return {
              ...node,
              wait: {
                ...node.wait,
                referenceField:
                  event.target.value.trim().length > 0
                    ? event.target.value
                    : undefined,
              },
            };
          })
        }
      />
      {waitReferencePreview && "error" in waitReferencePreview ? (
        <p className="text-xs text-muted-foreground">
          {waitReferencePreview.error}
        </p>
      ) : null}
      {waitReferencePreview && !("error" in waitReferencePreview) ? (
        <div className="rounded-md border border-border bg-muted/20 p-2 text-xs">
          <p className="text-muted-foreground">
            Reference date: {waitReferencePreview.referenceDate}
          </p>
          <p className="font-medium">
            Scheduled send: {waitReferencePreview.scheduledDate}
          </p>
        </div>
      ) : null}

      <label className="block text-xs text-muted-foreground">
        Offset Direction
      </label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={graphNode.wait.offsetDirection}
        disabled={readOnly}
        onChange={(event) =>
          updateSelectedNode((node) => {
            if (node.kind !== "wait") return node;
            return {
              ...node,
              wait: {
                ...node.wait,
                offsetDirection:
                  event.target.value === "before" ? "before" : "after",
              },
            };
          })
        }
      >
        <option value="after">after</option>
        <option value="before">before</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal config
// ---------------------------------------------------------------------------

function TerminalConfig({
  graphNode,
  readOnly,
  updateSelectedNode,
}: {
  graphNode: WorkflowBuilderNode & { kind: "terminal" };
  readOnly: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        Terminal Type
      </label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={graphNode.terminalType}
        disabled={readOnly}
        onChange={(event) =>
          updateSelectedNode((node) => {
            if (node.kind !== "terminal") return node;
            return {
              ...node,
              terminalType:
                event.target.value === "cancel" ? "cancel" : "complete",
            };
          })
        }
      >
        <option value="complete">complete</option>
        <option value="cancel">cancel</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Condition config
// ---------------------------------------------------------------------------

function ConditionConfig({
  graphNode,
  readOnly,
  updateSelectedNode,
}: {
  graphNode: WorkflowBuilderNode & { kind: "condition" };
  readOnly: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Evaluates conditions against the correlated entity. Routes to the{" "}
        <span className="font-medium text-green-600">true</span> or{" "}
        <span className="font-medium text-red-600">false</span> branch.
      </p>

      <label className="block text-xs text-muted-foreground">Match</label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={graphNode.guard.combinator}
        disabled={readOnly}
        onChange={(event) =>
          updateSelectedNode((node) => {
            if (node.kind !== "condition") return node;
            return {
              ...node,
              guard: {
                ...node.guard,
                combinator: event.target.value === "any" ? "any" : "all",
              },
            };
          })
        }
      >
        <option value="all">all conditions</option>
        <option value="any">any condition</option>
      </select>

      {graphNode.guard.conditions.map((condition, index) => (
        <GuardConditionRow
          key={`${graphNode.id}-cond-${index}`}
          condition={condition}
          index={index}
          nodeKind="condition"
          readOnly={readOnly}
          canRemove={graphNode.guard.conditions.length > 1}
          updateSelectedNode={updateSelectedNode}
        />
      ))}

      <button
        type="button"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        disabled={readOnly}
        onClick={() =>
          updateSelectedNode((node) => {
            if (node.kind !== "condition") return node;
            return {
              ...node,
              guard: {
                ...node.guard,
                conditions: [
                  ...node.guard.conditions,
                  createDefaultGuardCondition(),
                ],
              },
            };
          })
        }
      >
        Add Condition
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard editor (used by action nodes)
// ---------------------------------------------------------------------------

function GuardEditor({
  guard,
  readOnly,
  nodeKind,
  nodeId,
  updateSelectedNode,
}: {
  guard:
    | { combinator: "all" | "any"; conditions: WorkflowGuardCondition[] }
    | undefined;
  readOnly: boolean;
  nodeKind: "action";
  nodeId: string;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Guard</p>
        {guard ? (
          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            disabled={readOnly}
            onClick={() =>
              updateSelectedNode((node) => {
                if (node.kind !== "action") return node;
                return { ...node, guard: undefined };
              })
            }
          >
            Disable Guard
          </button>
        ) : (
          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            disabled={readOnly}
            onClick={() =>
              updateSelectedNode((node) => {
                if (node.kind !== "action") return node;
                return {
                  ...node,
                  guard: {
                    combinator: "all",
                    conditions: [createDefaultGuardCondition()],
                  },
                };
              })
            }
          >
            Enable Guard
          </button>
        )}
      </div>

      {guard ? (
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground">Match</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={guard.combinator}
            disabled={readOnly}
            onChange={(event) =>
              updateSelectedNode((node) => {
                if (node.kind !== "action" || !node.guard) return node;
                return {
                  ...node,
                  guard: {
                    ...node.guard,
                    combinator: event.target.value === "any" ? "any" : "all",
                  },
                };
              })
            }
          >
            <option value="all">all conditions</option>
            <option value="any">any condition</option>
          </select>

          {guard.conditions.map((condition, index) => (
            <GuardConditionRow
              key={`${nodeId}-guard-${index}`}
              condition={condition}
              index={index}
              nodeKind={nodeKind}
              readOnly={readOnly}
              canRemove={guard.conditions.length > 1}
              updateSelectedNode={updateSelectedNode}
            />
          ))}

          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            disabled={readOnly}
            onClick={() =>
              updateSelectedNode((node) => {
                if (node.kind !== "action" || !node.guard) return node;
                return {
                  ...node,
                  guard: {
                    ...node.guard,
                    conditions: [
                      ...node.guard.conditions,
                      createDefaultGuardCondition(),
                    ],
                  },
                };
              })
            }
          >
            Add Condition
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No guard configured. Add a guard to conditionally run this action.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard condition row (shared between action guard + condition node)
// ---------------------------------------------------------------------------

function GuardConditionRow({
  condition,
  index,
  nodeKind,
  readOnly,
  canRemove,
  updateSelectedNode,
}: {
  condition: WorkflowGuardCondition;
  index: number;
  nodeKind: "action" | "condition";
  readOnly: boolean;
  canRemove: boolean;
  updateSelectedNode: (
    updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  ) => void;
}) {
  const updateConditions = useCallback(
    (
      updater: (
        conditions: WorkflowGuardCondition[],
      ) => WorkflowGuardCondition[],
    ) => {
      updateSelectedNode((node) => {
        if (nodeKind === "action") {
          if (node.kind !== "action" || !node.guard) return node;
          return {
            ...node,
            guard: {
              ...node.guard,
              conditions: updater(node.guard.conditions),
            },
          };
        }
        if (node.kind !== "condition") return node;
        return {
          ...node,
          guard: { ...node.guard, conditions: updater(node.guard.conditions) },
        };
      });
    },
    [nodeKind, updateSelectedNode],
  );

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <label className="block text-xs text-muted-foreground">Field Path</label>
      <input
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={condition.field}
        disabled={readOnly}
        placeholder={
          nodeKind === "action" ? "appointment.startAt" : "appointment.status"
        }
        onChange={(event) =>
          updateConditions((conditions) =>
            conditions.map((entry, i) =>
              i === index
                ? {
                    ...entry,
                    field:
                      event.target.value.length > 0 ? event.target.value : "id",
                  }
                : entry,
            ),
          )
        }
      />

      <label className="block text-xs text-muted-foreground">Operator</label>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={condition.operator}
        disabled={readOnly}
        onChange={(event) => {
          if (!isGuardOperator(event.target.value)) return;
          const nextOperator = event.target.value;
          updateConditions((conditions) =>
            conditions.map((entry, i) => {
              if (i !== index) return entry;
              const base = {
                field: entry.field,
                operator: nextOperator,
              } as const;
              if (!operatorNeedsValue(nextOperator)) return base;
              const normalizedValue =
                nextOperator === "in" || nextOperator === "not_in"
                  ? Array.isArray(entry.value)
                    ? entry.value
                    : []
                  : Array.isArray(entry.value)
                    ? ""
                    : (entry.value ?? "");
              return { ...base, value: normalizedValue };
            }),
          );
        }}
      >
        {GUARD_OPERATORS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      {operatorNeedsValue(condition.operator) ? (
        <>
          <label className="block text-xs text-muted-foreground">Value</label>
          <input
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={formatGuardValueInput(condition.value, condition.operator)}
            disabled={readOnly}
            placeholder={
              condition.operator === "in" || condition.operator === "not_in"
                ? "valueA, valueB"
                : "example value"
            }
            onChange={(event) =>
              updateConditions((conditions) =>
                conditions.map((entry, i) =>
                  i === index
                    ? {
                        ...entry,
                        value: parseGuardValueInput(
                          event.target.value,
                          entry.operator,
                        ),
                      }
                    : entry,
                ),
              )
            }
          />
        </>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          disabled={readOnly || !canRemove}
          onClick={() =>
            updateConditions((conditions) => {
              const next = conditions.filter((_, i) => i !== index);
              return next.length > 0 ? next : [createDefaultGuardCondition()];
            })
          }
        >
          {nodeKind === "action" ? "Remove Condition" : "Remove"}
        </button>
      </div>
    </div>
  );
}
