import type {
  DomainEventType,
  SerializedWorkflowGraph,
  WorkflowNodeData,
} from "@scheduling/dto";
import { getLogger } from "@logtape/logtape";
import type { DbClient } from "../lib/db.js";
import { withOrg } from "../lib/db.js";
import { workflowRepository } from "../repositories/workflows.js";
import { resolveWaitUntil } from "./workflow-wait-time.js";

type SwitchBranch = "created" | "updated" | "deleted";

type ParsedNode = {
  id: string;
  kind: "trigger" | "action";
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

type ParsedEdge = {
  target: string;
  switchBranch?: SwitchBranch;
};

type ParsedGraph = {
  triggerNode: ParsedNode;
  nodeById: Map<string, ParsedNode>;
  outgoingByNodeId: Map<string, ParsedEdge[]>;
};

type RuntimeContext = Record<string, unknown>;

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

const workflowRunRequestedLogger = getLogger(["workflow", "run-requested"]);

export type WorkflowRunRequestedInput = {
  orgId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  graph: SerializedWorkflowGraph;
  triggerInput: Record<string, unknown>;
  eventContext: {
    eventType: DomainEventType;
    correlationKey?: string;
  };
};

export type WorkflowRunRequestedRuntime = {
  sleep: (stepId: string, delayMs: number) => Promise<void>;
};

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

async function withOrgContext<T>(
  orgId: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return withOrg(orgId, fn);
}

async function appendExecutionEvent(input: {
  orgId: string;
  workflowId: string;
  executionId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await withOrgContext(input.orgId, async (tx) => {
    const payload = {
      workflowId: input.workflowId,
      executionId: input.executionId,
      eventType: input.eventType,
      message: input.message,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    await workflowRepository.createExecutionEvent(tx, input.orgId, {
      ...payload,
    });
  });
}

async function appendExecutionEventOnce(input: {
  orgId: string;
  workflowId: string;
  executionId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const alreadyExists = await withOrgContext(input.orgId, async (tx) =>
    workflowRepository.hasExecutionEventType(tx, input.orgId, {
      executionId: input.executionId,
      eventType: input.eventType,
    }),
  );

  if (alreadyExists) {
    return;
  }

  await appendExecutionEvent(input);
}

async function loadExecution(input: { orgId: string; executionId: string }) {
  return withOrgContext(input.orgId, async (tx) =>
    workflowRepository.findExecutionById(tx, input.orgId, input.executionId),
  );
}

function isExecutionTerminal(status: string): boolean {
  return status === "success" || status === "error" || status === "cancelled";
}

export async function executeWorkflowRunRequested(
  input: WorkflowRunRequestedInput,
  runtime: WorkflowRunRequestedRuntime,
): Promise<void> {
  const graph = parseGraph(input.graph);

  await appendExecutionEventOnce({
    orgId: input.orgId,
    workflowId: input.workflowId,
    executionId: input.executionId,
    eventType: "run.started",
    message: "Manual run started",
    metadata: {
      eventType: input.eventContext.eventType,
    },
  });

  const runtimeContext = createRuntimeContext({
    eventType: input.eventContext.eventType,
    timestamp: new Date().toISOString(),
    payload: input.triggerInput,
  });

  const queue: string[] = [graph.triggerNode.id];
  const visited = new Set<string>();

  const processNextNode = async (): Promise<void> => {
    const nodeId = queue.shift();
    if (!nodeId) {
      return;
    }

    if (visited.has(nodeId)) {
      return processNextNode();
    }

    const execution = await loadExecution({
      orgId: input.orgId,
      executionId: input.executionId,
    });
    if (!execution || execution.status === "cancelled") {
      return;
    }

    const node = graph.nodeById.get(nodeId);
    if (!node) {
      return processNextNode();
    }

    visited.add(nodeId);
    const nodeReferenceName = toNodeReferenceName(node);

    const actionType =
      node.kind === "action" ? getNodeActionType(node) : undefined;
    const resolvedActionConfig =
      node.kind === "action"
        ? toActionConfig(resolveConfigTemplates(node.config, runtimeContext))
        : {};

    const latestNodeLog = await withOrgContext(input.orgId, async (tx) =>
      workflowRepository.findLatestExecutionLogByNodeId(tx, input.orgId, {
        executionId: input.executionId,
        nodeId: node.id,
      }),
    );

    if (latestNodeLog?.status === "success") {
      const priorOutput = asRecord(latestNodeLog.output);
      if (priorOutput) {
        runtimeContext[nodeReferenceName] = priorOutput;
      }

      queue.push(
        ...getNextNodeIds({
          node,
          outgoingByNodeId: graph.outgoingByNodeId,
          eventType: input.eventContext.eventType,
        }),
      );

      return processNextNode();
    }

    const startedAt = new Date();
    const log =
      latestNodeLog?.status === "running"
        ? latestNodeLog
        : await withOrgContext(input.orgId, async (tx) =>
            workflowRepository.createExecutionLog(tx, input.orgId, {
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
            }),
          );
    const logStartedAt = log.startedAt ? new Date(log.startedAt) : startedAt;

    try {
      if (!node.enabled) {
        const completedAt = new Date();
        await withOrgContext(input.orgId, async (tx) =>
          workflowRepository.completeExecutionLog(
            tx,
            input.orgId,
            input.executionId,
            {
              logId: log.id,
              status: "success",
              output: {
                skipped: true,
                reason: "node_disabled",
              },
              completedAt,
              duration: formatDurationMs(logStartedAt, completedAt),
            },
          ),
        );

        queue.push(
          ...getNextNodeIds({
            node,
            outgoingByNodeId: graph.outgoingByNodeId,
            eventType: input.eventContext.eventType,
          }),
        );
        return processNextNode();
      }

      let haltBranch = false;
      let output: Record<string, unknown> = {};

      if (node.kind === "trigger") {
        output = {
          accepted: true,
          eventType: input.eventContext.eventType,
          data: input.triggerInput,
        };
      } else {
        if (!actionType) {
          throw new Error(`Action type is missing for node '${node.label}'.`);
        }

        if (actionType === "wait") {
          const waitDuration = resolvedActionConfig["waitDuration"];
          const waitUntilRaw = resolvedActionConfig["waitUntil"];
          const waitOffset = resolvedActionConfig["waitOffset"];
          const waitTimezoneValue = resolvedActionConfig["waitTimezone"];
          const waitTimezone =
            typeof waitTimezoneValue === "string" ? waitTimezoneValue : null;

          const resolved = resolveWaitUntil({
            now: startedAt,
            waitDuration,
            waitUntil: waitUntilRaw,
            waitOffset,
            ...(waitTimezone ? { waitTimezone } : {}),
          });

          const waitUntil = resolved.waitUntil;
          if (!waitUntil) {
            throw new Error(
              resolved.error ?? "Failed to resolve wait timestamp.",
            );
          }

          const stepId = `wait-${input.executionId}-${node.id}`;
          const waitGateMode =
            typeof resolvedActionConfig["waitGateMode"] === "string"
              ? resolvedActionConfig["waitGateMode"]
              : "off";
          const waitingStates = await withOrgContext(input.orgId, async (tx) =>
            workflowRepository.listExecutionWaitingStates(
              tx,
              input.orgId,
              input.executionId,
            ),
          );
          let waitState =
            waitingStates.find((state) => state.nodeId === node.id) ?? null;

          if (!waitState) {
            const delayMs = waitUntil.getTime() - Date.now();

            if (waitGateMode === "require_actual_wait" && delayMs <= 0) {
              haltBranch = true;
              output = {
                skipped: true,
                reason: "wait_already_due",
              };
            } else if (delayMs <= 0) {
              output = {
                waited: false,
                reason: "wait_already_due",
              };
            } else {
              const markedWaiting = await withOrgContext(
                input.orgId,
                async (tx) =>
                  workflowRepository.markExecutionWaiting(
                    tx,
                    input.orgId,
                    input.executionId,
                  ),
              );

              if (!markedWaiting && execution.status !== "waiting") {
                haltBranch = true;
                output = {
                  skipped: true,
                  reason: "execution_not_running",
                };
              } else {
                waitState = await withOrgContext(input.orgId, async (tx) =>
                  workflowRepository.createWaitState(tx, input.orgId, {
                    executionId: input.executionId,
                    workflowId: input.workflowId,
                    runId: execution.workflowRunId ?? execution.id,
                    nodeId: node.id,
                    nodeName: node.label,
                    waitType: "delay",
                    status: "waiting",
                    waitUntil,
                    correlationKey: input.eventContext.correlationKey ?? null,
                    metadata: {
                      waitDuration,
                      waitUntil: waitUntilRaw,
                      waitOffset,
                      ...(waitTimezoneValue !== undefined
                        ? { waitTimezone: waitTimezoneValue }
                        : {}),
                      waitGateMode,
                    },
                  }),
                );

                await appendExecutionEvent({
                  orgId: input.orgId,
                  workflowId: input.workflowId,
                  executionId: input.executionId,
                  eventType: "run.waiting",
                  message: `Run waiting in delay node '${node.label}'`,
                  metadata: {
                    nodeId: node.id,
                    waitUntil: waitUntil.toISOString(),
                    waitDuration,
                    waitOffset,
                  },
                });
              }
            }
          }

          if (waitState) {
            const effectiveWaitUntil = waitState.waitUntil ?? waitUntil;
            const delayMs = Math.max(
              0,
              effectiveWaitUntil.getTime() - Date.now(),
            );

            await runtime.sleep(stepId, delayMs);

            const latestExecution = await loadExecution({
              orgId: input.orgId,
              executionId: input.executionId,
            });

            if (!latestExecution || latestExecution.status === "cancelled") {
              haltBranch = true;
              output = {
                skipped: true,
                reason: "execution_cancelled",
              };
            } else {
              const resumed = await withOrgContext(input.orgId, async (tx) =>
                workflowRepository.markWaitStateResumed(
                  tx,
                  input.orgId,
                  waitState.id,
                ),
              );

              if (resumed) {
                await withOrgContext(input.orgId, async (tx) =>
                  workflowRepository.markExecutionRunning(
                    tx,
                    input.orgId,
                    input.executionId,
                  ),
                );

                await appendExecutionEvent({
                  orgId: input.orgId,
                  workflowId: input.workflowId,
                  executionId: input.executionId,
                  eventType: "run.resumed",
                  message: `Run resumed after delay node '${node.label}'`,
                  metadata: {
                    nodeId: node.id,
                  },
                });
              }

              output = {
                waited: true,
                waitUntil: effectiveWaitUntil.toISOString(),
                delayMs,
              };
            }
          }
        } else if (actionType === "switch") {
          output = {
            branch: getEventSwitchBranch(input.eventContext.eventType),
          };
        } else if (actionType === "condition") {
          const condition = resolvedActionConfig["condition"];
          const passed = evaluateConditionExpression({
            condition,
            context: runtimeContext,
          });

          haltBranch = !passed;
          output = {
            passed,
            expression: condition,
          };
        } else if (actionType === "http-request") {
          output = await executeHttpRequestAction(resolvedActionConfig);
        } else if (actionType === "logger") {
          const messageValue = resolvedActionConfig["message"];
          const message = valueToInterpolatedString(messageValue);

          workflowRunRequestedLogger.info("Workflow logger action: {message}", {
            message,
          });

          await appendExecutionEvent({
            orgId: input.orgId,
            workflowId: input.workflowId,
            executionId: input.executionId,
            eventType: "run.log",
            message,
            metadata: {
              nodeId: node.id,
              nodeName: node.label,
            },
          });

          output = {
            logged: true,
            message,
          };
        } else {
          throw new Error(`Unsupported action type '${actionType}'.`);
        }
      }

      const completedAt = new Date();
      await withOrgContext(input.orgId, async (tx) =>
        workflowRepository.completeExecutionLog(
          tx,
          input.orgId,
          input.executionId,
          {
            logId: log.id,
            status: "success",
            output,
            completedAt,
            duration: formatDurationMs(logStartedAt, completedAt),
          },
        ),
      );

      if (!haltBranch) {
        runtimeContext[nodeReferenceName] = output;

        queue.push(
          ...getNextNodeIds({
            node,
            outgoingByNodeId: graph.outgoingByNodeId,
            eventType: input.eventContext.eventType,
          }),
        );
      }

      return processNextNode();
    } catch (error: unknown) {
      const completedAt = new Date();
      const message =
        error instanceof Error
          ? error.message
          : "Workflow node execution failed.";

      await withOrgContext(input.orgId, async (tx) =>
        workflowRepository.completeExecutionLog(
          tx,
          input.orgId,
          input.executionId,
          {
            logId: log.id,
            status: "error",
            error: message,
            completedAt,
            duration: formatDurationMs(logStartedAt, completedAt),
          },
        ),
      );

      await withOrgContext(input.orgId, async (tx) => {
        await workflowRepository.markExecutionErrored(
          tx,
          input.orgId,
          input.executionId,
          message,
        );
      });

      await appendExecutionEvent({
        orgId: input.orgId,
        workflowId: input.workflowId,
        executionId: input.executionId,
        eventType: "run.failed",
        message: `Run failed in node '${node.label}'`,
        metadata: {
          nodeId: node.id,
          error: message,
        },
      });
    }
  };

  await processNextNode();

  const latestExecution = await loadExecution({
    orgId: input.orgId,
    executionId: input.executionId,
  });

  if (!latestExecution || isExecutionTerminal(latestExecution.status)) {
    return;
  }

  await withOrgContext(input.orgId, async (tx) =>
    workflowRepository.markExecutionSucceeded(
      tx,
      input.orgId,
      input.executionId,
      {
        completed: true,
        eventType: input.eventContext.eventType,
      },
    ),
  );

  await appendExecutionEvent({
    orgId: input.orgId,
    workflowId: input.workflowId,
    executionId: input.executionId,
    eventType: "run.completed",
    message: "Run completed successfully",
  });
}
