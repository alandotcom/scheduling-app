import type {
  DomainEventType,
  SerializedWorkflowGraph,
  WorkflowNodeData,
} from "@scheduling/dto";
import {
  executeStandardNodeAction,
  executeWaitNodeAction,
} from "./workflow-runtime/action-executors.js";
import type {
  WorkflowRunRequestedInput,
  WorkflowRunRequestedRuntime,
} from "./workflow-runtime/contracts.js";
import { WorkflowRuntimePersistence } from "./workflow-runtime/persistence.js";
import { runWorkflowScheduler } from "./workflow-runtime/scheduler.js";
import { workflowExecutionEventType } from "./workflow-execution-events.js";
import type {
  ParsedEdge,
  ParsedGraph,
  ParsedNode,
  RuntimeContext,
  SwitchBranch,
} from "./workflow-runtime/types.js";

type OutputEnvelope = Record<string, unknown> & {
  success: unknown;
  data: unknown;
};

const HTTP_REQUEST_TIMEOUT_MS = 15_000;
const REFERENCE_TOKEN_PATTERN =
  /@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\.\d+)*/g;
const SAFE_CONDITION_CHARS_PATTERN = /^[\w\s@'".[\]()!<>=&|:+\-*/%,?]+$/;
const CONDITION_ASSIGNMENT_PATTERN = /(?<![=!<>])=(?!=)/;
const CONDITION_DANGEROUS_PATTERN =
  /\b(?:new|function|import|require|process|global|window|document|constructor|__proto__|prototype|eval)\b/i;

export type { WorkflowRunRequestedInput, WorkflowRunRequestedRuntime };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function parseNodeData(data: WorkflowNodeData): Omit<ParsedNode, "id"> {
  return {
    kind: data.type,
    label:
      typeof data.label === "string" && data.label.trim().length > 0
        ? data.label.trim()
        : data.type === "trigger"
          ? "Trigger"
          : "Action",
    enabled: data.enabled !== false,
    config: asRecord(data.config) ?? {},
  };
}

function toSwitchBranch(value: unknown): SwitchBranch | undefined {
  if (value === "created" || value === "updated" || value === "deleted") {
    return value;
  }

  return;
}

function getEventSwitchBranch(
  eventType: DomainEventType,
): SwitchBranch | undefined {
  const suffix = eventType.split(".").at(-1);

  if (suffix === "created" || suffix === "updated" || suffix === "deleted") {
    return suffix;
  }

  return;
}

function parseGraph(graph: SerializedWorkflowGraph): ParsedGraph {
  const nodeById = new Map<string, ParsedNode>();

  for (const serializedNode of graph.nodes) {
    const parsedData = parseNodeData(serializedNode.attributes.data);
    const parsedNode: ParsedNode = {
      ...parsedData,
      id: serializedNode.attributes.id,
    };
    nodeById.set(parsedNode.id, parsedNode);
  }

  const triggerNode = [...nodeById.values()].find(
    (node) => node.kind === "trigger",
  );

  if (!triggerNode) {
    throw new Error("Workflow graph is missing a trigger node.");
  }

  const outgoingByNodeId = new Map<string, ParsedEdge[]>();

  for (const serializedEdge of graph.edges) {
    const existing = outgoingByNodeId.get(serializedEdge.source) ?? [];
    const edgeData = asRecord(serializedEdge.attributes["data"]);
    const switchBranch = toSwitchBranch(edgeData?.["switchBranch"]);
    existing.push(
      switchBranch
        ? {
            target: serializedEdge.target,
            switchBranch,
          }
        : {
            target: serializedEdge.target,
          },
    );
    outgoingByNodeId.set(serializedEdge.source, existing);
  }

  return {
    triggerNode,
    nodeById,
    outgoingByNodeId,
  };
}

function getNodeActionType(node: ParsedNode): string | undefined {
  if (node.kind !== "action") {
    return;
  }

  const actionType = node.config["actionType"];
  return typeof actionType === "string" && actionType.trim().length > 0
    ? actionType.trim()
    : undefined;
}

function isWaitNode(node: ParsedNode | undefined): boolean {
  if (!node || node.kind !== "action") {
    return false;
  }

  return getNodeActionType(node) === "wait";
}

function getNextNodeIds(input: {
  node: ParsedNode;
  outgoingByNodeId: Map<string, ParsedEdge[]>;
  eventType: DomainEventType;
}): string[] {
  const outgoingEdges = input.outgoingByNodeId.get(input.node.id) ?? [];

  if (input.node.kind !== "action") {
    return outgoingEdges.map((edge) => edge.target);
  }

  const actionType = getNodeActionType(input.node);
  if (actionType !== "switch") {
    return outgoingEdges.map((edge) => edge.target);
  }

  const branch = getEventSwitchBranch(input.eventType);
  if (!branch) {
    return [];
  }

  return outgoingEdges
    .filter((edge) => edge.switchBranch === branch)
    .map((edge) => edge.target);
}

function buildIncomingByNodeId(
  outgoingByNodeId: Map<string, ParsedEdge[]>,
): Map<string, string[]> {
  const incomingByNodeId = new Map<string, string[]>();

  for (const [source, edges] of outgoingByNodeId.entries()) {
    for (const edge of edges) {
      const incoming = incomingByNodeId.get(edge.target) ?? [];
      incoming.push(source);
      incomingByNodeId.set(edge.target, incoming);
    }
  }

  return incomingByNodeId;
}

function shouldHaltBranchFromOutput(
  node: ParsedNode,
  output: Record<string, unknown> | null,
): boolean {
  if (!output) {
    return false;
  }

  if (output["skipped"] === true) {
    return true;
  }

  if (node.kind !== "action") {
    return false;
  }

  const actionType = getNodeActionType(node);
  return actionType === "condition" && output["passed"] === false;
}

function toDomainRoot(eventType: DomainEventType): string {
  const domainPrefix = eventType.split(".")[0] ?? "Event";

  return domainPrefix
    .split("_")
    .map((segment) => {
      if (segment.length === 0) {
        return "";
      }

      return `${segment[0]!.toUpperCase()}${segment.slice(1)}`;
    })
    .join("");
}

function toNodeReferenceName(node: ParsedNode): string {
  const compactLabel = node.label.replace(/[^A-Za-z0-9_]/g, "");
  if (compactLabel.length > 0) {
    return compactLabel;
  }

  const compactId = node.id.replace(/[^A-Za-z0-9_]/g, "");
  if (compactId.length > 0) {
    return compactId;
  }

  return `Node${node.id}`;
}

function toStepSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "node";
}

function buildNodeStepPrefixById(
  nodeById: Map<string, ParsedNode>,
): Map<string, string> {
  const countsByBaseSlug = new Map<string, number>();
  const prefixById = new Map<string, string>();

  for (const node of nodeById.values()) {
    const baseSlug = toStepSlug(node.label);
    const nextCount = (countsByBaseSlug.get(baseSlug) ?? 0) + 1;
    countsByBaseSlug.set(baseSlug, nextCount);

    const prefix = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
    prefixById.set(node.id, prefix);
  }

  return prefixById;
}

function createRuntimeContext(input: {
  eventType: DomainEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}): RuntimeContext {
  const eventRoot = toDomainRoot(input.eventType);

  return {
    [eventRoot]: {
      event: input.eventType,
      timestamp: input.timestamp,
      data: input.payload,
    },
  };
}

function isOutputEnvelope(
  value: Record<string, unknown>,
): value is OutputEnvelope {
  return "success" in value && "data" in value;
}

function resolveReferencePath(
  context: RuntimeContext,
  reference: string,
): unknown {
  const normalized = reference.startsWith("@") ? reference.slice(1) : reference;
  const segments = normalized
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return;
  }

  let current: unknown = context;

  for (const segment of segments) {
    const currentRecord = asRecord(current);

    if (!currentRecord) {
      if (Array.isArray(current) && /^\d+$/.test(segment)) {
        current = current[Number.parseInt(segment, 10)];
        continue;
      }

      return;
    }

    if (!(segment in currentRecord) && isOutputEnvelope(currentRecord)) {
      const envelopeData = currentRecord["data"];
      const envelopeDataRecord = asRecord(envelopeData);

      if (envelopeDataRecord && segment in envelopeDataRecord) {
        current = envelopeDataRecord[segment];
        continue;
      }
    }

    current = currentRecord[segment];
  }

  return current;
}

function valueToInterpolatedString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function resolveExpressionValue(
  value: string,
  context: RuntimeContext,
): unknown {
  const trimmed = value.trim();
  const fullReferenceMatch =
    /^@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\.\d+)+$/.exec(trimmed);

  if (fullReferenceMatch) {
    const resolved = resolveReferencePath(context, fullReferenceMatch[0]);
    return resolved ?? value;
  }

  return value.replaceAll(REFERENCE_TOKEN_PATTERN, (token) => {
    const resolved = resolveReferencePath(context, token);
    return resolved === undefined ? token : valueToInterpolatedString(resolved);
  });
}

function resolveConfigTemplates(
  value: unknown,
  context: RuntimeContext,
): unknown {
  if (typeof value === "string") {
    return resolveExpressionValue(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveConfigTemplates(entry, context));
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      resolveConfigTemplates(entry, context),
    ]),
  );
}

type ConditionToken =
  | { type: "operator"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "literal"; value: unknown }
  | { type: "identifier"; value: string };

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_@]/.test(char);
}

function isIdentifierBody(char: string): boolean {
  return /[A-Za-z0-9_.@]/.test(char);
}

function tokenizeConditionExpression(expression: string): ConditionToken[] {
  const tokens: ConditionToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (!char) {
      break;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const threeChars = expression.slice(index, index + 3);
    if (threeChars === "===" || threeChars === "!==") {
      tokens.push({ type: "operator", value: threeChars });
      index += 3;
      continue;
    }

    const twoChars = expression.slice(index, index + 2);
    if (
      twoChars === "&&" ||
      twoChars === "||" ||
      twoChars === "==" ||
      twoChars === "!=" ||
      twoChars === ">=" ||
      twoChars === "<="
    ) {
      tokens.push({ type: "operator", value: twoChars });
      index += 2;
      continue;
    }

    if (char === ">" || char === "<" || char === "!") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let cursor = index + 1;
      let literal = "";

      while (cursor < expression.length) {
        const next = expression[cursor];
        if (!next) {
          break;
        }

        if (next === "\\") {
          const escaped = expression[cursor + 1];
          if (!escaped) {
            throw new Error("Invalid escape sequence in condition string.");
          }

          literal += escaped;
          cursor += 2;
          continue;
        }

        if (next === quote) {
          break;
        }

        literal += next;
        cursor += 1;
      }

      if (expression[cursor] !== quote) {
        throw new Error("Unterminated string literal in condition.");
      }

      tokens.push({ type: "literal", value: literal });
      index = cursor + 1;
      continue;
    }

    if (/\d/.test(char)) {
      let cursor = index + 1;
      while (cursor < expression.length && /[\d.]/.test(expression[cursor]!)) {
        cursor += 1;
      }

      const numeric = Number(expression.slice(index, cursor));
      if (Number.isNaN(numeric)) {
        throw new Error("Invalid numeric literal in condition.");
      }

      tokens.push({ type: "literal", value: numeric });
      index = cursor;
      continue;
    }

    if (isIdentifierStart(char)) {
      let cursor = index + 1;
      while (
        cursor < expression.length &&
        isIdentifierBody(expression[cursor]!)
      ) {
        cursor += 1;
      }

      const tokenValue = expression.slice(index, cursor);
      if (tokenValue === "true") {
        tokens.push({ type: "literal", value: true });
      } else if (tokenValue === "false") {
        tokens.push({ type: "literal", value: false });
      } else if (tokenValue === "null") {
        tokens.push({ type: "literal", value: null });
      } else if (tokenValue === "undefined") {
        tokens.push({ type: "literal", value: undefined });
      } else {
        tokens.push({ type: "identifier", value: tokenValue });
      }

      index = cursor;
      continue;
    }

    throw new Error(`Unexpected character '${char}' in condition.`);
  }

  return tokens;
}

function evaluateComparison(input: {
  operator: string;
  left: unknown;
  right: unknown;
}): boolean {
  const comparableLeft =
    typeof input.left === "number" || typeof input.left === "string"
      ? input.left
      : valueToInterpolatedString(input.left);
  const comparableRight =
    typeof input.right === "number" || typeof input.right === "string"
      ? input.right
      : valueToInterpolatedString(input.right);

  switch (input.operator) {
    case "===":
      return input.left === input.right;
    case "!==":
      return input.left !== input.right;
    case "==":
      return input.left == input.right;
    case "!=":
      return input.left != input.right;
    case ">":
      return comparableLeft > comparableRight;
    case "<":
      return comparableLeft < comparableRight;
    case ">=":
      return comparableLeft >= comparableRight;
    case "<=":
      return comparableLeft <= comparableRight;
    default:
      throw new Error(`Unsupported comparison operator '${input.operator}'.`);
  }
}

function parseConditionTokens(input: {
  tokens: ConditionToken[];
  context: RuntimeContext;
}): boolean {
  let cursor = 0;

  const peek = (): ConditionToken | undefined => input.tokens[cursor];

  const consume = (): ConditionToken => {
    const token = input.tokens[cursor];
    if (!token) {
      throw new Error("Unexpected end of condition expression.");
    }

    cursor += 1;
    return token;
  };

  const parsePrimary = (): unknown => {
    const token = consume();

    if (token.type === "literal") {
      return token.value;
    }

    if (token.type === "identifier") {
      return resolveReferencePath(input.context, token.value);
    }

    if (token.type === "lparen") {
      const nested = parseOr();
      const closing = consume();
      if (closing.type !== "rparen") {
        throw new Error("Missing closing ')' in condition expression.");
      }
      return nested;
    }

    throw new Error("Invalid condition expression.");
  };

  const parseUnary = (): unknown => {
    const token = peek();
    if (token?.type === "operator" && token.value === "!") {
      consume();
      return !parseUnary();
    }

    return parsePrimary();
  };

  const parseComparison = (): unknown => {
    const left = parseUnary();
    const token = peek();

    if (
      token?.type === "operator" &&
      ["===", "!==", "==", "!=", ">", "<", ">=", "<="].includes(token.value)
    ) {
      consume();
      const right = parseUnary();
      return evaluateComparison({
        operator: token.value,
        left,
        right,
      });
    }

    return left;
  };

  const parseAnd = (): boolean => {
    let value = Boolean(parseComparison());

    while (true) {
      const token = peek();
      if (!(token?.type === "operator" && token.value === "&&")) {
        break;
      }

      consume();
      value = value && Boolean(parseComparison());
    }

    return value;
  };

  const parseOr = (): boolean => {
    let value = parseAnd();

    while (true) {
      const token = peek();
      if (!(token?.type === "operator" && token.value === "||")) {
        break;
      }

      consume();
      value = value || parseAnd();
    }

    return value;
  };

  const result = parseOr();
  if (cursor !== input.tokens.length) {
    throw new Error("Unexpected tokens at end of condition expression.");
  }

  return result;
}

function evaluateConditionExpression(input: {
  condition: unknown;
  context: RuntimeContext;
}): boolean {
  if (typeof input.condition === "boolean") {
    return input.condition;
  }

  if (
    typeof input.condition !== "string" ||
    input.condition.trim().length === 0
  ) {
    return false;
  }

  if (!SAFE_CONDITION_CHARS_PATTERN.test(input.condition)) {
    throw new Error("Condition contains unsupported characters.");
  }

  if (CONDITION_ASSIGNMENT_PATTERN.test(input.condition)) {
    throw new Error("Condition contains disallowed assignment operator.");
  }

  if (CONDITION_DANGEROUS_PATTERN.test(input.condition)) {
    throw new Error("Condition contains disallowed keyword.");
  }

  const tokens = tokenizeConditionExpression(input.condition);
  return parseConditionTokens({
    tokens,
    context: input.context,
  });
}

function parseHeaders(headers: unknown): Record<string, string> {
  if (typeof headers === "string") {
    const trimmed = headers.trim();
    if (trimmed.length === 0) {
      return {};
    }

    const parsed = JSON.parse(trimmed) as unknown;
    const parsedRecord = asRecord(parsed);
    if (!parsedRecord) {
      throw new Error("httpHeaders must be a JSON object.");
    }

    return Object.fromEntries(
      Object.entries(parsedRecord).map(([key, value]) => [key, String(value)]),
    );
  }

  const record = asRecord(headers);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, String(value)]),
  );
}

function parseRequestBody(input: {
  method: string;
  body: unknown;
  headers: Record<string, string>;
}): BodyInit | undefined {
  if (input.method === "GET" || input.method === "HEAD") {
    return;
  }

  if (input.body === undefined || input.body === null) {
    return;
  }

  const hasContentType = Object.keys(input.headers).some(
    (key) => key.toLowerCase() === "content-type",
  );

  if (typeof input.body === "string") {
    const trimmed = input.body.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (!hasContentType) {
      try {
        JSON.parse(trimmed);
        input.headers["Content-Type"] = "application/json";
      } catch {
        // Keep string body as-is when not valid JSON
      }
    }

    return trimmed;
  }

  if (!hasContentType) {
    input.headers["Content-Type"] = "application/json";
  }

  return JSON.stringify(input.body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function executeHttpRequestAction(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint =
    typeof config["endpoint"] === "string" ? config["endpoint"].trim() : "";
  if (endpoint.length === 0) {
    throw new Error("HTTP request endpoint is required.");
  }

  const methodRaw =
    typeof config["httpMethod"] === "string" ? config["httpMethod"] : "POST";
  const method = methodRaw.toUpperCase();

  const headers = parseHeaders(config["httpHeaders"]);
  const body = parseRequestBody({
    method,
    body: config["httpBody"],
    headers,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, HTTP_REQUEST_TIMEOUT_MS);

  try {
    const requestInit: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined) {
      requestInit.body = body;
    }

    const response = await fetch(endpoint, requestInit);

    const parsedBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(
        `HTTP request failed with status ${response.status}: ${valueToInterpolatedString(parsedBody)}`,
      );
    }

    return {
      status: response.status,
      data: parsedBody,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toActionConfig(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return record ? record : {};
}

function formatDurationMs(startedAt: Date, completedAt: Date): string {
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  return String(durationMs);
}

function isExecutionTerminal(status: string): boolean {
  return status === "success" || status === "error" || status === "cancelled";
}

export async function executeWorkflowRunRequested(
  input: WorkflowRunRequestedInput,
  runtime: WorkflowRunRequestedRuntime,
): Promise<void> {
  const persistence = new WorkflowRuntimePersistence(input.orgId);
  const initialExecution = await persistence.loadExecution(input.executionId);
  if (!initialExecution) {
    throw new Error(
      `Workflow execution not found for run request: ${input.executionId}`,
    );
  }

  if (isExecutionTerminal(initialExecution.status)) {
    return;
  }

  const graph = parseGraph(input.graph);
  const incomingByNodeId = buildIncomingByNodeId(graph.outgoingByNodeId);
  const nodeStepPrefixById = buildNodeStepPrefixById(graph.nodeById);

  await persistence.appendExecutionEventOnce({
    workflowId: input.workflowId,
    executionId: input.executionId,
    eventType: workflowExecutionEventType.runStarted,
    message: "Run started",
    metadata: {
      eventType: input.eventContext.eventType,
    },
  });

  const runtimeContext = createRuntimeContext({
    eventType: input.eventContext.eventType,
    timestamp: new Date().toISOString(),
    payload: input.triggerInput,
  });

  const schedulerResult = await runWorkflowScheduler({
    graph,
    incomingByNodeId,
    eventType: input.eventContext.eventType,
    loadExecution: async () => persistence.loadExecution(input.executionId),
    getNextNodeIds,
    isWaitNode,
    executeNode: async ({ node, execution }) => {
      const nodeReferenceName = toNodeReferenceName(node);
      const nodeStepPrefix =
        nodeStepPrefixById.get(node.id) ?? toStepSlug(node.id);
      const stepId = `node-${nodeStepPrefix}`;
      const actionType =
        node.kind === "action" ? getNodeActionType(node) : undefined;
      const resolvedActionConfig =
        node.kind === "action"
          ? toActionConfig(resolveConfigTemplates(node.config, runtimeContext))
          : {};

      const latestNodeLog = await persistence.findLatestExecutionLogByNodeId({
        executionId: input.executionId,
        nodeId: node.id,
      });

      if (latestNodeLog?.status === "success") {
        const priorOutput = asRecord(latestNodeLog.output);
        if (priorOutput) {
          runtimeContext[nodeReferenceName] = priorOutput;
        }

        return {
          failed: false,
          haltBranch: shouldHaltBranchFromOutput(node, priorOutput),
          output: priorOutput ?? {},
        };
      }

      const startedAt = new Date();
      const log =
        latestNodeLog?.status === "running"
          ? latestNodeLog
          : await persistence.createExecutionLog({
              executionId: input.executionId,
              nodeId: node.id,
              nodeName: node.label,
              nodeType:
                node.kind === "trigger" ? "trigger" : (actionType ?? "action"),
              status: "running",
              startedAt,
              input:
                node.kind === "trigger"
                  ? {
                      eventType: input.eventContext.eventType,
                      payload: input.triggerInput,
                    }
                  : resolvedActionConfig,
            });

      const logStartedAt = log.startedAt ? new Date(log.startedAt) : startedAt;

      const completeExecutionLogSuccess = async (
        output: Record<string, unknown>,
      ) => {
        const completedAt = new Date();
        await persistence.completeExecutionLog(input.executionId, {
          logId: log.id,
          status: "success",
          output,
          completedAt,
          duration: formatDurationMs(logStartedAt, completedAt),
        });
      };

      const failExecutionLog = async (message: string) => {
        const completedAt = new Date();
        await persistence.completeExecutionLog(input.executionId, {
          logId: log.id,
          status: "error",
          error: message,
          completedAt,
          duration: formatDurationMs(logStartedAt, completedAt),
        });
        await persistence.markExecutionErrored(input.executionId, message);
        await persistence.appendExecutionEvent({
          workflowId: input.workflowId,
          executionId: input.executionId,
          eventType: workflowExecutionEventType.runFailed,
          message: `Run failed in node '${node.label}'`,
          metadata: {
            nodeId: node.id,
            nodeName: node.label,
            error: message,
          },
        });
      };

      try {
        let outcome: {
          haltBranch: boolean;
          output: Record<string, unknown>;
        };

        if (!node.enabled) {
          outcome = {
            haltBranch: true,
            output: {
              skipped: true,
              reason: "node_disabled",
            },
          };
        } else if (actionType === "wait") {
          outcome = await executeWaitNodeAction({
            workflowInput: input,
            execution,
            node,
            resolvedActionConfig,
            runtime,
            persistence,
            stepId,
            startedAt,
          });
        } else {
          const stepResult = await runtime.runStep(stepId, async () => {
            const actionResult = await executeStandardNodeAction({
              workflowInput: input,
              node,
              actionType,
              resolvedActionConfig,
              runtimeContext,
              persistence,
              dependencies: {
                valueToInterpolatedString,
                evaluateConditionExpression,
                executeHttpRequestAction,
                getEventSwitchBranch,
              },
            });

            return {
              haltBranch: actionResult.haltBranch,
              output: actionResult.output,
            };
          });

          outcome = {
            haltBranch: stepResult["haltBranch"] === true,
            output: asRecord(stepResult["output"]) ?? {},
          };
        }

        await completeExecutionLogSuccess(outcome.output);
        runtimeContext[nodeReferenceName] = outcome.output;

        return {
          failed: false,
          haltBranch: outcome.haltBranch,
          output: outcome.output,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Workflow node execution failed.";
        await failExecutionLog(message);

        return {
          failed: true,
          haltBranch: true,
          output: {},
        };
      }
    },
  });

  const latestExecution = await persistence.loadExecution(input.executionId);
  if (
    !latestExecution ||
    schedulerResult.hasNodeFailure ||
    isExecutionTerminal(latestExecution.status)
  ) {
    return;
  }

  await persistence.markExecutionSucceeded(input.executionId, {
    completed: true,
    eventType: input.eventContext.eventType,
  });

  await persistence.appendExecutionEvent({
    workflowId: input.workflowId,
    executionId: input.executionId,
    eventType: workflowExecutionEventType.runCompleted,
    message: "Run completed successfully",
  });
}
