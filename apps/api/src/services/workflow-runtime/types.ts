import type { DomainEventType } from "@scheduling/dto";

export type SwitchBranch = "created" | "updated" | "deleted";

export type ParsedNode = {
  id: string;
  kind: "trigger" | "action";
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type ParsedEdge = {
  target: string;
  switchBranch?: SwitchBranch;
};

export type ParsedGraph = {
  triggerNode: ParsedNode;
  nodeById: Map<string, ParsedNode>;
  outgoingByNodeId: Map<string, ParsedEdge[]>;
};

export type RuntimeContext = Record<string, unknown>;

export type NodeRuntimeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "waiting"
  | "cancelled";

export type NodeActionOutcome = {
  haltBranch: boolean;
  output: Record<string, unknown>;
};

export type NodeExecutionResult = {
  failed: boolean;
  haltBranch: boolean;
  output: Record<string, unknown>;
  status?: NodeRuntimeStatus;
};

export type NextNodeResolver = (input: {
  node: ParsedNode;
  outgoingByNodeId: Map<string, ParsedEdge[]>;
  eventType: DomainEventType;
}) => string[];
