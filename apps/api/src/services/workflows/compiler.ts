import {
  workflowGraphDocumentSchema,
  workflowValidationResultSchema,
  type WorkflowGraphDocument,
  type WorkflowValidationIssue,
  type WorkflowValidationResult,
} from "@scheduling/dto";
import { getWorkflowActionDefinition } from "./registry.js";

type WorkflowDocumentLike = {
  schemaVersion?: number;
  trigger?: unknown;
  nodes?: unknown;
  edges?: unknown;
  steps?: unknown;
  [key: string]: unknown;
};

type CanonicalNode = {
  id: string;
  kind: string;
  config: Record<string, unknown>;
};

type CanonicalEdge = {
  id: string;
  source: string;
  target: string;
  branch?: "next" | "timeout" | "true" | "false";
};

export type WorkflowCompilationResult = {
  validation: WorkflowValidationResult;
  compiledPlan: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sortEdgesDeterministically(edges: CanonicalEdge[]): CanonicalEdge[] {
  return [...edges].toSorted((left, right) => {
    const bySource = left.source.localeCompare(right.source);
    if (bySource !== 0) return bySource;
    const byTarget = left.target.localeCompare(right.target);
    if (byTarget !== 0) return byTarget;
    return left.id.localeCompare(right.id);
  });
}

function sortNodesDeterministically(nodes: CanonicalNode[]): CanonicalNode[] {
  return [...nodes].toSorted((left, right) => left.id.localeCompare(right.id));
}

function getTriggerEventType(document: WorkflowDocumentLike): string | null {
  const trigger = document.trigger;
  if (!isRecord(trigger)) {
    return null;
  }

  const eventType = trigger["eventType"];
  if (typeof eventType === "string" && eventType.length > 0) {
    return eventType;
  }

  const event = trigger["event"];
  if (typeof event === "string" && event.length > 0) {
    return event;
  }

  return null;
}

function buildCanonicalNodes(document: WorkflowDocumentLike): CanonicalNode[] {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  if (nodes.length > 0) {
    return nodes.flatMap((entry) => {
      if (!isRecord(entry)) return [];

      const id = entry["id"];
      const kind = entry["kind"];
      if (typeof id !== "string" || id.length === 0) return [];
      if (typeof kind !== "string" || kind.length === 0) return [];

      const config = { ...entry };
      delete config["id"];
      delete config["kind"];
      return [{ id, kind, config }];
    });
  }

  // Temporary bridge for legacy editor payloads that still use `steps`.
  const legacySteps = Array.isArray(document.steps) ? document.steps : [];
  return legacySteps.flatMap((entry) => {
    if (!isRecord(entry)) return [];

    const id = entry["id"];
    const type = entry["type"];
    if (typeof id !== "string" || id.length === 0) return [];
    if (typeof type !== "string" || type.length === 0) return [];

    const kind = type === "wait" ? "wait" : "action";
    const config = { ...entry };
    delete config["id"];
    return [{ id, kind, config }];
  });
}

function buildCanonicalEdges(document: WorkflowDocumentLike): CanonicalEdge[] {
  const edges = Array.isArray(document.edges) ? document.edges : [];
  if (edges.length > 0) {
    return edges.flatMap((entry, index) => {
      if (!isRecord(entry)) return [];

      const source = entry["source"];
      const target = entry["target"];
      const id = entry["id"];
      const branch = entry["branch"];

      if (typeof source !== "string" || source.length === 0) return [];
      if (typeof target !== "string" || target.length === 0) return [];

      const edgeId =
        typeof id === "string" && id.length > 0 ? id : `edge_${index + 1}`;

      if (
        branch === "next" ||
        branch === "timeout" ||
        branch === "true" ||
        branch === "false"
      ) {
        return [{ id: edgeId, source, target, branch }];
      }

      return [{ id: edgeId, source, target }];
    });
  }

  const nodes = buildCanonicalNodes(document);
  if (nodes.length < 2) {
    return [];
  }

  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge_${index + 1}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    branch: "next",
  }));
}

function findCycleNode(
  nodes: CanonicalNode[],
  edges: CanonicalEdge[],
): string | null {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): string | null {
    if (visiting.has(nodeId)) return nodeId;
    if (visited.has(nodeId)) return null;

    visiting.add(nodeId);
    for (const nextNode of adjacency.get(nodeId) ?? []) {
      const cycle = visit(nextNode);
      if (cycle) return cycle;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }

  return null;
}

export function compileWorkflowDocument(
  workflow: WorkflowGraphDocument,
): WorkflowCompilationResult {
  const parsed = workflowGraphDocumentSchema.safeParse(workflow);
  if (!parsed.success) {
    return {
      validation: workflowValidationResultSchema.parse({
        valid: false,
        issues: [
          {
            code: "INVALID_EXPRESSION",
            severity: "error",
            field: "workflowGraph",
            message: "Workflow draft is not a valid workflow graph document",
          },
        ],
      }),
      compiledPlan: null,
    };
  }

  const document = parsed.data as WorkflowDocumentLike;
  const issues: WorkflowValidationIssue[] = [];
  const triggerEventType = getTriggerEventType(document);
  const nodes = buildCanonicalNodes(document);
  const edges = buildCanonicalEdges(document);
  const nodeIdSet = new Set(nodes.map((node) => node.id));

  if (Object.keys(document).length === 0) {
    issues.push({
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      field: "workflowGraph",
      message: "Workflow draft cannot be empty",
    });
  }

  if (!triggerEventType) {
    issues.push({
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      field: "trigger.eventType",
      message: "Workflow trigger event type is required",
    });
  }

  for (const edge of edges) {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) {
      issues.push({
        code: "INVALID_EDGE",
        severity: "error",
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing node(s)`,
      });
    }
  }

  for (const node of nodes) {
    if (node.kind === "condition") {
      const guard = node.config["guard"];
      if (!isRecord(guard)) {
        issues.push({
          code: "MISSING_REQUIRED_FIELD",
          severity: "error",
          nodeId: node.id,
          field: "guard",
          message: `Condition node "${node.id}" must have a guard with at least one condition`,
        });
      } else {
        const conditions = guard["conditions"];
        if (!Array.isArray(conditions) || conditions.length === 0) {
          issues.push({
            code: "MISSING_REQUIRED_FIELD",
            severity: "error",
            nodeId: node.id,
            field: "guard.conditions",
            message: `Condition node "${node.id}" must have at least one condition`,
          });
        }
      }
      continue;
    }

    if (node.kind !== "action") {
      continue;
    }

    const actionId = node.config["actionId"];
    if (typeof actionId !== "string" || actionId.length === 0) {
      // Legacy action nodes without explicit action IDs are still allowed
      // while we migrate editor payloads to first-party action contracts.
      continue;
    }

    const actionDefinition = getWorkflowActionDefinition(actionId);
    if (!actionDefinition) {
      issues.push({
        code: "MISSING_INTEGRATION",
        severity: "error",
        nodeId: node.id,
        field: "actionId",
        message: `Unknown workflow action "${actionId}"`,
      });
      continue;
    }

    const integrationKey = node.config["integrationKey"];
    if (
      typeof integrationKey === "string" &&
      integrationKey.length > 0 &&
      integrationKey !== actionDefinition.integrationKey
    ) {
      issues.push({
        code: "MISSING_INTEGRATION",
        severity: "error",
        nodeId: node.id,
        field: "integrationKey",
        message: `Action "${actionId}" requires integration "${actionDefinition.integrationKey}"`,
      });
    }

    const rawInput = node.config["input"];
    const inputObj = isRecord(rawInput) ? rawInput : {};
    // Skip strict schema validation when input contains template variables —
    // templates like {{@nodeId:Label.field}} are resolved at runtime.
    const hasTemplates = Object.values(inputObj).some(
      (v) => typeof v === "string" && /\{\{@[^:]+:[^}]+\}\}/.test(v),
    );
    if (!hasTemplates) {
      const parsedInput = actionDefinition.inputSchema.safeParse(inputObj);
      if (!parsedInput.success) {
        const firstIssue = parsedInput.error.issues[0];
        issues.push({
          code: "INVALID_EXPRESSION",
          severity: "error",
          nodeId: node.id,
          field: "input",
          message: firstIssue
            ? `Invalid action input for "${actionId}": ${firstIssue.message}`
            : `Invalid action input for "${actionId}"`,
        });
      }
    }
  }

  if (issues.some((issue) => issue.code === "INVALID_EDGE")) {
    return {
      validation: workflowValidationResultSchema.parse({
        valid: false,
        issues,
      }),
      compiledPlan: null,
    };
  }

  const cycleNodeId = findCycleNode(nodes, edges);
  if (cycleNodeId) {
    issues.push({
      code: "CYCLE_DETECTED",
      severity: "error",
      nodeId: cycleNodeId,
      message: `Workflow graph contains a cycle at node "${cycleNodeId}"`,
    });
  }

  const incomingCount = new Map<string, number>();
  for (const node of nodes) {
    incomingCount.set(node.id, 0);
  }
  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const entryNodeIds = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .toSorted();

  if (nodes.length > 0 && entryNodeIds.length === 0) {
    issues.push({
      code: "INVALID_EDGE",
      severity: "error",
      field: "edges",
      message: "Workflow graph must have at least one entry node",
    });
  }

  if (entryNodeIds.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of edges) {
      adjacency.get(edge.source)?.push(edge.target);
    }

    const visited = new Set<string>();
    const queue = [...entryNodeIds];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const nextNode of adjacency.get(current) ?? []) {
        if (!visited.has(nextNode)) queue.push(nextNode);
      }
    }

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        issues.push({
          code: "UNREACHABLE_NODE",
          severity: "warning",
          nodeId: node.id,
          message: `Node "${node.id}" is unreachable from any entry path`,
        });
      }
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  if (hasErrors) {
    return {
      validation: workflowValidationResultSchema.parse({
        valid: false,
        issues,
      }),
      compiledPlan: null,
    };
  }

  const trigger = isRecord(document.trigger) ? document.trigger : null;
  const sortedNodes = sortNodesDeterministically(nodes);
  const sortedEdges = sortEdgesDeterministically(edges);
  const compiledPlan = {
    planVersion: 1,
    graphSchemaVersion:
      typeof document.schemaVersion === "number" ? document.schemaVersion : 1,
    trigger: {
      eventType: triggerEventType,
      retryPolicy:
        trigger !== null && isRecord(trigger["retryPolicy"])
          ? trigger["retryPolicy"]
          : null,
      debounce:
        trigger !== null && isRecord(trigger["debounce"])
          ? trigger["debounce"]
          : null,
      replacement:
        trigger !== null && isRecord(trigger["replacement"])
          ? trigger["replacement"]
          : null,
    },
    entryNodeIds,
    nodes: sortedNodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label:
        typeof node.config["label"] === "string"
          ? node.config["label"]
          : node.id,
      ...node.config,
    })),
    edges: sortedEdges,
  } satisfies Record<string, unknown>;

  return {
    validation: workflowValidationResultSchema.parse({
      valid: true,
      issues,
    }),
    compiledPlan,
  };
}
