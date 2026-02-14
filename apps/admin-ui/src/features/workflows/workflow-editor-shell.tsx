import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import type {
  RunWorkflowDraftInput,
  WorkflowDefinitionDetail,
  WorkflowGraphDocument,
  WorkflowRunStatus,
  WorkflowStepLogStatus,
  WorkflowValidationResult,
} from "@scheduling/dto";
import { EntityListLoadingState } from "@/components/entity-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canonicalGraphToReferenceGraph,
  createDefaultReferenceWorkflowGraph,
  mapCanonicalRunStatusToReferenceRunStatus,
  type ReferenceWorkflowEdge,
  type ReferenceWorkflowGraph,
  type ReferenceWorkflowNode,
  referenceGraphToCanonicalGraph,
} from "@/lib/workflows/reference-adapter";
import { orpc } from "@/lib/query";
// eslint-disable-next-line import/no-unassigned-import
import "@xyflow/react/dist/style.css";

type WorkflowBranch = "next" | "timeout" | "true" | "false";

type EditorNodeData = {
  type: "trigger" | "action";
  label: string;
  description: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status: string;
};

type EditorNode = Node<EditorNodeData>;
type EditorEdge = Edge<{ branch?: WorkflowBranch }>;
type RunEntityType = RunWorkflowDraftInput["entityType"];

const RUN_ENTITY_TYPES: RunEntityType[] = [
  "appointment",
  "calendar",
  "appointment_type",
  "resource",
  "location",
  "client",
  "workflow",
];

const SELECT_CLASS_NAME =
  "border-input focus-visible:border-ring focus-visible:ring-ring/30 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkflowBranch(value: unknown): value is WorkflowBranch {
  return (
    value === "next" ||
    value === "timeout" ||
    value === "true" ||
    value === "false"
  );
}

function isRunEntityType(value: string): value is RunEntityType {
  return RUN_ENTITY_TYPES.some((entityType) => entityType === value);
}

function getTriggerSummary(graph: WorkflowGraphDocument): string {
  const trigger = graph.trigger;
  if (!trigger) {
    return "No trigger configured";
  }

  if (trigger.type === "schedule") {
    return `Schedule: ${trigger.expression} (${trigger.timezone})`;
  }

  return `Domain: ${trigger.domain} (${(trigger.startEvents ?? []).length} start / ${(trigger.restartEvents ?? []).length} restart / ${(trigger.stopEvents ?? []).length} stop)`;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function formatDateTime(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return parsed.toLocaleString();
}

function formatDuration(durationMs: number | null): string {
  if (typeof durationMs !== "number") {
    return "n/a";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function toRunStatusBadgeVariant(
  status: WorkflowRunStatus,
): "default" | "secondary" | "success" | "warning" | "destructive" {
  const normalized = mapCanonicalRunStatusToReferenceRunStatus(status);

  switch (normalized) {
    case "running":
      return "default";
    case "success":
      return "success";
    case "cancelled":
      return "secondary";
    case "pending":
    case "waiting":
      return "warning";
    case "error":
    default:
      return "destructive";
  }
}

function toStepStatusBadgeVariant(
  status: WorkflowStepLogStatus,
): "default" | "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "running":
      return "default";
    case "success":
      return "success";
    case "pending":
      return "warning";
    case "skipped":
      return "secondary";
    case "error":
    default:
      return "destructive";
  }
}

function toEditorNode(node: ReferenceWorkflowNode, index: number): EditorNode {
  const nodeData = isRecord(node.data) ? node.data : {};
  const rawConfig = nodeData["config"];
  const config = isRecord(rawConfig) ? rawConfig : {};
  const isTriggerNode =
    node.type === "trigger" || nodeData["type"] === "trigger";
  const triggerType =
    typeof config["triggerType"] === "string"
      ? config["triggerType"]
      : "Webhook";
  const actionType =
    typeof config["actionType"] === "string" ? config["actionType"] : "Action";

  const label =
    typeof nodeData["label"] === "string" && nodeData["label"].trim().length > 0
      ? nodeData["label"]
      : isTriggerNode
        ? triggerType
        : actionType;

  return {
    id: node.id,
    type: "default",
    position: node.position ?? { x: index * 220, y: 120 },
    data: {
      type: isTriggerNode ? "trigger" : "action",
      label,
      description:
        typeof nodeData["description"] === "string"
          ? nodeData["description"]
          : "",
      config,
      enabled: nodeData["enabled"] !== false,
      status:
        typeof nodeData["status"] === "string" ? nodeData["status"] : "idle",
    },
    draggable: true,
    selectable: true,
    connectable: true,
    style: isTriggerNode
      ? {
          border:
            "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))",
          background:
            "color-mix(in srgb, var(--primary) 8%, var(--background))",
        }
      : undefined,
  };
}

function toEditorEdge(edge: ReferenceWorkflowEdge): EditorEdge {
  const branch = isRecord(edge.data) ? edge.data["branch"] : undefined;
  const parsedBranch = isWorkflowBranch(branch) ? branch : undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    ...(parsedBranch
      ? { data: { branch: parsedBranch }, label: parsedBranch }
      : {}),
  };
}

function referenceGraphToEditorFlow(graph: ReferenceWorkflowGraph): {
  nodes: EditorNode[];
  edges: EditorEdge[];
} {
  return {
    nodes: graph.nodes.map((node, index) => toEditorNode(node, index)),
    edges: graph.edges.map((edge) => toEditorEdge(edge)),
  };
}

function editorFlowToReferenceGraph(
  nodes: EditorNode[],
  edges: EditorEdge[],
): ReferenceWorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.type === "trigger" ? "trigger" : "action",
      position: node.position,
      data: {
        type: node.data.type,
        label: node.data.label,
        description: node.data.description,
        enabled: node.data.enabled,
        status: node.data.status,
        config: node.data.config,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(isWorkflowBranch(edge.data?.branch)
        ? { data: { branch: edge.data.branch } }
        : {}),
    })),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Operation failed";
}

function defaultWaitNode(position: { x: number; y: number }): EditorNode {
  return {
    id: nanoid(),
    type: "default",
    position,
    data: {
      type: "action",
      label: "Wait",
      description: "Delay execution",
      config: {
        actionType: "Wait",
        waitDuration: "PT30M",
      },
      enabled: true,
      status: "idle",
    },
  };
}

function defaultConditionNode(position: { x: number; y: number }): EditorNode {
  return {
    id: nanoid(),
    type: "default",
    position,
    data: {
      type: "action",
      label: "Condition",
      description: "Branch execution",
      config: {
        actionType: "Condition",
        guard: {
          combinator: "all",
          conditions: [{ field: "trigger", operator: "exists" }],
        },
      },
      enabled: true,
      status: "idle",
    },
  };
}

function defaultActionNode(
  position: { x: number; y: number },
  actionId: string,
): EditorNode {
  return {
    id: nanoid(),
    type: "default",
    position,
    data: {
      type: "action",
      label: actionId,
      description: "",
      config: {
        actionType: actionId,
        actionId,
        input: {},
      },
      enabled: true,
      status: "idle",
    },
  };
}

interface WorkflowEditorShellProps {
  workflowId: string;
}

export function WorkflowEditorShell({ workflowId }: WorkflowEditorShellProps) {
  const queryClient = useQueryClient();
  const definitionQueryOptions = useMemo(
    () =>
      orpc.workflows.getDefinition.queryOptions({
        input: { id: workflowId },
      }),
    [workflowId],
  );
  const definitionQuery = useQuery(definitionQueryOptions);
  const catalogQuery = useQuery(orpc.workflows.catalog.queryOptions());
  const runsQueryOptions = useMemo(
    () =>
      orpc.workflows.listRuns.queryOptions({
        input: {
          definitionId: workflowId,
          limit: 25,
        },
      }),
    [workflowId],
  );

  const saveMutation = useMutation(
    orpc.workflows.updateDraft.mutationOptions(),
  );
  const validateMutation = useMutation(
    orpc.workflows.validateDraft.mutationOptions(),
  );
  const publishMutation = useMutation(
    orpc.workflows.publishDraft.mutationOptions(),
  );
  const runDraftMutation = useMutation(
    orpc.workflows.runDraft.mutationOptions(),
  );
  const cancelRunMutation = useMutation(
    orpc.workflows.cancelRun.mutationOptions(),
  );

  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [edges, setEdges] = useState<EditorEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runEntityType, setRunEntityType] =
    useState<RunEntityType>("appointment");
  const [runEntityId, setRunEntityId] = useState("");
  const [configDraft, setConfigDraft] = useState("{}");
  const [isDirty, setIsDirty] = useState(false);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<WorkflowValidationResult | null>(null);
  const runsQuery = useQuery({
    ...runsQueryOptions,
    refetchInterval: 4000,
  });
  const stepLogsQuery = useQuery({
    ...orpc.workflows.listRunSteps.queryOptions({
      input: {
        runId: selectedRunId ?? "__unselected__",
      },
    }),
    enabled: selectedRunId !== null,
    refetchInterval: selectedRunId ? 4000 : false,
  });

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const runs = runsQuery.data?.items ?? [];
  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId],
  );
  const firstActionId =
    catalogQuery.data?.actions[0]?.id ?? "core.emitInternalEvent";

  useEffect(() => {
    const definition = definitionQuery.data;
    if (!definition) {
      return;
    }

    try {
      const reference = canonicalGraphToReferenceGraph(
        definition.draftWorkflowGraph,
      );
      const flow = referenceGraphToEditorFlow(reference);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setAdapterError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to adapt workflow graph for editor";
      setAdapterError(message);
      const fallbackFlow = referenceGraphToEditorFlow(
        createDefaultReferenceWorkflowGraph(),
      );
      setNodes(fallbackFlow.nodes);
      setEdges(fallbackFlow.edges);
    }

    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedRunId(null);
    setValidationResult(null);
    setIsDirty(false);
  }, [definitionQuery.data?.id, definitionQuery.data?.draftRevision]);

  useEffect(() => {
    if (!selectedNode) {
      setConfigDraft("{}");
      return;
    }

    setConfigDraft(JSON.stringify(selectedNode.data.config ?? {}, null, 2));
  }, [selectedNode]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(runs[0]?.runId ?? null);
    }
  }, [runs, selectedRunId]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setValidationResult(null);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      setNodes((current) => {
        const safeChanges = changes.filter((change) => {
          if (change.type !== "remove") {
            return true;
          }
          const target = current.find((node) => node.id === change.id);
          return target?.data.type !== "trigger";
        });

        return applyNodeChanges(safeChanges, current);
      });
      markDirty();
    },
    [markDirty],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
      markDirty();
    },
    [markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `edge_${nanoid()}`,
            type: "smoothstep",
          },
          current,
        ),
      );
      markDirty();
    },
    [markDirty],
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (!connection.source || !connection.target) {
        return false;
      }
      if (connection.source === connection.target) {
        return false;
      }

      const targetNode = nodes.find((node) => node.id === connection.target);
      if (targetNode?.data.type === "trigger") {
        return false;
      }

      return true;
    },
    [nodes],
  );

  const updateSelectedNode = useCallback(
    (updater: (node: EditorNode) => EditorNode) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId ? updater(node) : node,
        ),
      );
      markDirty();
    },
    [markDirty, selectedNodeId],
  );

  const applyNodeConfigDraft = useCallback(() => {
    if (!selectedNode) {
      return;
    }

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(configDraft);
    } catch {
      toast.error("Config must be valid JSON");
      return;
    }

    if (!isRecord(parsedConfig)) {
      toast.error("Config JSON must be an object");
      return;
    }

    updateSelectedNode((node) => {
      const actionType =
        typeof parsedConfig["actionType"] === "string"
          ? parsedConfig["actionType"]
          : node.data.label;
      const triggerType =
        typeof parsedConfig["triggerType"] === "string"
          ? parsedConfig["triggerType"]
          : node.data.label;
      const nextLabel = node.data.type === "trigger" ? triggerType : actionType;
      return {
        ...node,
        data: {
          ...node.data,
          config: parsedConfig,
          label: nextLabel || node.data.label,
        },
      };
    });
  }, [configDraft, selectedNode, updateSelectedNode]);

  const addNode = useCallback(
    (kind: "action" | "wait" | "condition") => {
      const anchor = nodes.find((node) => node.id === selectedNodeId) ?? null;
      const position = anchor
        ? { x: anchor.position.x + 240, y: anchor.position.y }
        : { x: 280 + nodes.length * 30, y: 120 + (nodes.length % 3) * 60 };

      const node =
        kind === "wait"
          ? defaultWaitNode(position)
          : kind === "condition"
            ? defaultConditionNode(position)
            : defaultActionNode(position, firstActionId);

      setNodes((current) => [...current, node]);
      if (anchor) {
        setEdges((current) => [
          ...current,
          {
            id: `edge_${nanoid()}`,
            source: anchor.id,
            target: node.id,
            type: "smoothstep",
          },
        ]);
      }
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      markDirty();
    },
    [firstActionId, markDirty, nodes, selectedNodeId],
  );

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode || selectedNode.data.type === "trigger") {
      return;
    }
    setNodes((current) =>
      current.filter((node) => node.id !== selectedNode.id),
    );
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setSelectedNodeId(null);
    markDirty();
  }, [markDirty, selectedNode]);

  const updateSelectedEdgeBranch = useCallback(
    (branch: string) => {
      if (!selectedEdgeId) {
        return;
      }
      const nextBranch = isWorkflowBranch(branch) ? branch : undefined;
      setEdges((current) =>
        current.map((edge) =>
          edge.id !== selectedEdgeId
            ? edge
            : {
                ...edge,
                ...(nextBranch
                  ? { data: { branch: nextBranch }, label: nextBranch }
                  : { data: undefined, label: undefined }),
              },
        ),
      );
      markDirty();
    },
    [markDirty, selectedEdgeId],
  );

  const saveDraft =
    useCallback(async (): Promise<WorkflowDefinitionDetail | null> => {
      if (!definitionQuery.data) {
        return null;
      }
      if (!isDirty) {
        return definitionQuery.data;
      }

      let canonicalGraph: WorkflowGraphDocument;
      try {
        const referenceGraph = editorFlowToReferenceGraph(nodes, edges);
        canonicalGraph = referenceGraphToCanonicalGraph(referenceGraph);
        setAdapterError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to convert graph";
        setAdapterError(message);
        toast.error(message);
        return null;
      }

      try {
        const updated = await saveMutation.mutateAsync({
          id: workflowId,
          workflowGraph: canonicalGraph,
          expectedRevision: definitionQuery.data.draftRevision,
        });
        queryClient.setQueryData(definitionQueryOptions.queryKey, updated);
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setIsDirty(false);
        toast.success("Draft saved");
        return updated;
      } catch (error) {
        toast.error(getErrorMessage(error));
        return null;
      }
    }, [
      definitionQuery.data,
      definitionQueryOptions.queryKey,
      edges,
      isDirty,
      nodes,
      queryClient,
      saveMutation,
      workflowId,
    ]);

  const validateDraft = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved) {
      return;
    }

    try {
      const result = await validateMutation.mutateAsync({ id: workflowId });
      setValidationResult(result);
      if (result.valid) {
        toast.success("Workflow is valid");
      } else {
        toast.error(`Validation returned ${result.issues.length} issue(s)`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [saveDraft, validateMutation, workflowId]);

  const publishDraft = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved) {
      return;
    }

    try {
      const published = await publishMutation.mutateAsync({
        id: workflowId,
        expectedRevision: saved.draftRevision,
      });
      queryClient.setQueryData(definitionQueryOptions.queryKey, published);
      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      setIsDirty(false);
      toast.success("Workflow published");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    definitionQueryOptions.queryKey,
    publishMutation,
    queryClient,
    saveDraft,
    workflowId,
  ]);

  const runDraft = useCallback(async () => {
    const trimmedEntityId = runEntityId.trim();
    if (!isUuid(trimmedEntityId)) {
      toast.error("Entity ID must be a valid UUID");
      return;
    }

    const saved = await saveDraft();
    if (!saved) {
      return;
    }

    try {
      const response = await runDraftMutation.mutateAsync({
        id: workflowId,
        entityType: runEntityType,
        entityId: trimmedEntityId,
      });
      await queryClient.invalidateQueries({
        queryKey: runsQueryOptions.queryKey,
      });
      const refreshedRuns = await runsQuery.refetch();
      if (refreshedRuns.data?.items[0]) {
        setSelectedRunId(refreshedRuns.data.items[0].runId);
      }
      toast.success(`Draft run queued (${response.triggerEventId})`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    queryClient,
    runDraftMutation,
    runEntityId,
    runEntityType,
    runsQuery,
    runsQueryOptions.queryKey,
    saveDraft,
    workflowId,
  ]);

  const cancelSelectedRun = useCallback(async () => {
    if (!selectedRunId) {
      return;
    }

    try {
      await cancelRunMutation.mutateAsync({ runId: selectedRunId });
      await queryClient.invalidateQueries({
        queryKey: runsQueryOptions.queryKey,
      });
      await runsQuery.refetch();
      await stepLogsQuery.refetch();
      toast.success("Run cancellation requested");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    cancelRunMutation,
    queryClient,
    runsQuery,
    runsQueryOptions.queryKey,
    selectedRunId,
    stepLogsQuery,
  ]);

  if (definitionQuery.isLoading) {
    return (
      <section className="h-full w-full p-4">
        <EntityListLoadingState rows={6} cols={6} />
      </section>
    );
  }

  if (definitionQuery.error || !definitionQuery.data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Not Found</CardTitle>
            <CardDescription>
              We could not load this workflow. It may have been removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/workflows">
                <Icon icon={ArrowLeft01Icon} className="size-4" />
                Back to workflows
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const workflow = definitionQuery.data;
  const triggerSummary = getTriggerSummary(workflow.draftWorkflowGraph);
  const isMutating =
    saveMutation.isPending ||
    validateMutation.isPending ||
    publishMutation.isPending;
  const isRunMutating =
    runDraftMutation.isPending || cancelRunMutation.isPending;

  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] w-full min-w-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/workflows">
                <Icon icon={ArrowLeft01Icon} className="size-4" />
                Back
              </Link>
            </Button>
            <Badge
              variant={workflow.status === "active" ? "default" : "warning"}
            >
              {workflow.status}
            </Badge>
            {isDirty ? <Badge variant="secondary">Unsaved</Badge> : null}
          </div>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {workflow.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {triggerSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => addNode("action")}
            disabled={isMutating}
          >
            <Icon icon={Add01Icon} className="size-4" />
            Add Action
          </Button>
          <Button
            variant="outline"
            onClick={() => addNode("wait")}
            disabled={isMutating}
          >
            Add Wait
          </Button>
          <Button
            variant="outline"
            onClick={() => addNode("condition")}
            disabled={isMutating}
          >
            Add Condition
          </Button>
          <Button
            variant="outline"
            onClick={() => void saveDraft()}
            disabled={!isDirty || isMutating}
          >
            Save
          </Button>
          <Button
            variant="outline"
            onClick={() => void validateDraft()}
            disabled={isMutating}
          >
            Validate
          </Button>
          <Button onClick={() => void publishDraft()} disabled={isMutating}>
            Publish
          </Button>
        </div>
      </header>

      {adapterError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive lg:px-6">
          {adapterError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_event, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
            minZoom={0.3}
            maxZoom={1.8}
            className="h-full w-full"
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="hidden h-full w-[340px] shrink-0 space-y-4 overflow-y-auto border-l border-border bg-background p-4 lg:block">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selection</CardTitle>
              <CardDescription>
                {selectedNode
                  ? `Node: ${selectedNode.data.label}`
                  : selectedEdge
                    ? `Edge: ${selectedEdge.id}`
                    : "Select a node or edge to edit"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedNode ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="node-label">Label</Label>
                    <Input
                      id="node-label"
                      value={selectedNode.data.label}
                      onChange={(event) =>
                        updateSelectedNode((node) => ({
                          ...node,
                          data: { ...node.data, label: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="node-config">Config (JSON)</Label>
                    <Textarea
                      id="node-config"
                      value={configDraft}
                      onChange={(event) => setConfigDraft(event.target.value)}
                      className="min-h-44 font-mono text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <Button variant="outline" onClick={applyNodeConfigDraft}>
                        Apply Config
                      </Button>
                      {selectedNode.data.type !== "trigger" ? (
                        <Button
                          variant="outline"
                          onClick={removeSelectedNode}
                          className="text-destructive"
                        >
                          <Icon icon={Delete01Icon} className="size-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : selectedEdge ? (
                <div className="space-y-2">
                  <Label htmlFor="edge-branch">Branch</Label>
                  <select
                    id="edge-branch"
                    value={selectedEdge.data?.branch ?? ""}
                    onChange={(event) =>
                      updateSelectedEdgeBranch(event.target.value)
                    }
                    className={SELECT_CLASS_NAME}
                  >
                    <option value="">(none)</option>
                    <option value="next">next</option>
                    <option value="timeout">timeout</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Graph Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Nodes:</span>{" "}
                {nodes.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Edges:</span>{" "}
                {edges.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Actions:</span>{" "}
                {catalogQuery.data?.actions.length ?? 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation</CardTitle>
              <CardDescription>
                {validationResult
                  ? validationResult.valid
                    ? "Workflow is valid."
                    : `${validationResult.issues.length} issue(s).`
                  : "Run validation to inspect compiler issues."}
              </CardDescription>
            </CardHeader>
            {validationResult && validationResult.issues.length > 0 ? (
              <CardContent className="space-y-2">
                {validationResult.issues.slice(0, 8).map((issue, index) => (
                  <div
                    key={`${issue.code}-${issue.nodeId ?? "none"}-${index}`}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-medium">
                      {issue.severity.toUpperCase()} · {issue.code}
                    </p>
                    <p className="text-muted-foreground">{issue.message}</p>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run Draft</CardTitle>
              <CardDescription>
                Trigger a manual run for a specific entity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="run-entity-type">Entity type</Label>
                <select
                  id="run-entity-type"
                  value={runEntityType}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (isRunEntityType(nextValue)) {
                      setRunEntityType(nextValue);
                    }
                  }}
                  className={SELECT_CLASS_NAME}
                >
                  {RUN_ENTITY_TYPES.map((entityType) => (
                    <option key={entityType} value={entityType}>
                      {entityType}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="run-entity-id">Entity ID</Label>
                <Input
                  id="run-entity-id"
                  value={runEntityId}
                  onChange={(event) => setRunEntityId(event.target.value)}
                  placeholder="UUID"
                />
              </div>

              <Button
                onClick={() => void runDraft()}
                disabled={isRunMutating || !isUuid(runEntityId.trim())}
                className="w-full"
              >
                {runDraftMutation.isPending ? "Running..." : "Run draft"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Runs</CardTitle>
              <CardDescription>
                Recent workflow runs for this definition.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runsQuery.refetch()}
                  disabled={runsQuery.isFetching}
                >
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void cancelSelectedRun()}
                  disabled={!selectedRunId || cancelRunMutation.isPending}
                >
                  Cancel selected
                </Button>
              </div>

              {runsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading runs...</p>
              ) : runsQuery.error ? (
                <p className="text-sm text-destructive">Failed to load runs.</p>
              ) : runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => {
                    const normalizedStatus =
                      mapCanonicalRunStatusToReferenceRunStatus(run.status);
                    const isSelected = run.runId === selectedRunId;

                    return (
                      <button
                        key={run.runId}
                        type="button"
                        onClick={() => setSelectedRunId(run.runId)}
                        className={`w-full rounded-md border p-2 text-left transition hover:border-primary/40 ${isSelected ? "border-primary/40 bg-primary/5" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-mono text-xs">
                            {run.runId}
                          </p>
                          <Badge variant={toRunStatusBadgeVariant(run.status)}>
                            {normalizedStatus}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {run.entityType} · {run.entityId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Started {formatDateTime(run.startedAt)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step Logs</CardTitle>
              <CardDescription>
                {selectedRun
                  ? `Run ${selectedRun.runId}`
                  : "Select a run to inspect step logs."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!selectedRunId ? (
                <p className="text-sm text-muted-foreground">
                  No run selected.
                </p>
              ) : stepLogsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading step logs...
                </p>
              ) : stepLogsQuery.error ? (
                <p className="text-sm text-destructive">
                  Failed to load step logs.
                </p>
              ) : (stepLogsQuery.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No step logs recorded yet.
                </p>
              ) : (
                stepLogsQuery.data?.items.map((log) => (
                  <div key={log.id} className="space-y-1 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {log.nodeName || log.nodeType}
                      </p>
                      <Badge variant={toStepStatusBadgeVariant(log.status)}>
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {log.nodeType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Duration: {formatDuration(log.durationMs)}
                    </p>
                    {log.errorMessage ? (
                      <p className="text-xs text-destructive">
                        {log.errorMessage}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
