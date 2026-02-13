// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  Settings02Icon,
  Clock01Icon,
  GitBranchIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  WebhookEventType,
  WorkflowActionCatalogItem,
  WorkflowGraphDocument,
} from "@scheduling/dto";
import { workflowGraphDocumentSchema } from "@scheduling/dto";

import { WorkflowCanvas } from "./workflow-canvas";
import { SidebarPanel } from "./sidebar-panel";
import { NodeConfigPanel } from "./node-config-panel";
import {
  buildDocumentFromFlow,
  createDefaultGuardCondition,
  createNodeId,
  createTriggerFlowNode,
  documentSignature,
  isRecord,
  toFlowEdge,
  toFlowNode,
  updateNodeGraphData,
  TRIGGER_NODE_ID,
  type BuilderEdge,
  type BuilderNode,
  type WorkflowBuilderNode,
} from "./utils";

export type WorkflowNodeCreationKind =
  | "action"
  | "wait"
  | "condition"
  | "terminal";

export type WorkflowNodeCreationRequest = {
  kind: WorkflowNodeCreationKind;
  sourceNodeId?: string | null | undefined;
  sourceHandleId?: string | null | undefined;
  position?: { x: number; y: number };
};

type WorkflowEditorProps = {
  document: WorkflowGraphDocument;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  triggerEventType: WebhookEventType;
  availableTriggerEventTypes: readonly WebhookEventType[];
  onTriggerEventTypeChange: (eventType: WebhookEventType) => void;
  onChange: (next: WorkflowGraphDocument) => void;
  readOnly?: boolean;
  sidebarExtra?: ReactNode;
};

function getEdgeBranch(edge: BuilderEdge): string | undefined {
  if (edge.sourceHandle === "true" || edge.sourceHandle === "false") {
    return edge.sourceHandle;
  }

  const branch = isRecord(edge.data) ? edge.data["branch"] : undefined;
  return typeof branch === "string" ? branch : undefined;
}

export function WorkflowEditor({
  document,
  actionCatalog,
  triggerEventType,
  availableTriggerEventTypes,
  onTriggerEventTypeChange,
  onChange,
  readOnly = false,
  sidebarExtra,
}: WorkflowEditorProps) {
  const lastEmittedSignatureRef = useRef<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"properties" | "runs">(
    "properties",
  );

  const normalizedDocument = useMemo(() => {
    const parsed = workflowGraphDocumentSchema.safeParse(document);
    if (parsed.success) return parsed.data;
    return workflowGraphDocumentSchema.parse({
      schemaVersion: 1,
      nodes: [],
      edges: [],
    });
  }, [document]);

  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [edges, setEdges] = useState<BuilderEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<BuilderNode> | null>(null);

  const normalizedDocumentSig = useMemo(
    () => documentSignature(normalizedDocument),
    [normalizedDocument],
  );

  useEffect(() => {
    if (lastEmittedSignatureRef.current === normalizedDocumentSig) return;
    const flowNodes = [
      createTriggerFlowNode(triggerEventType),
      ...normalizedDocument.nodes.map((node, index) =>
        toFlowNode(node, index, actionCatalog),
      ),
    ];
    const flowEdges = normalizedDocument.edges.map((edge) => toFlowEdge(edge));
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId((current) => {
      if (!current) return null;
      return flowNodes.some((n) => n.id === current) ? current : null;
    });
  }, [
    actionCatalog,
    triggerEventType,
    normalizedDocument.nodes,
    normalizedDocument.edges,
    normalizedDocumentSig,
  ]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedGraphNode = selectedNode?.data.graphNode ?? null;

  const emitChange = useCallback(
    (nextNodes: BuilderNode[], nextEdges: BuilderEdge[]) => {
      const nextDoc = buildDocumentFromFlow({
        currentDocument: normalizedDocument,
        flowNodes: nextNodes,
        flowEdges: nextEdges,
      });
      lastEmittedSignatureRef.current = documentSignature(nextDoc);
      onChange(nextDoc);
    },
    [normalizedDocument, onChange],
  );

  const focusNodeInViewport = useCallback(
    (nodeId: string) => {
      if (!reactFlowInstance) return;
      requestAnimationFrame(() => {
        void reactFlowInstance.fitView({
          nodes: [{ id: nodeId }],
          padding: 0.4,
          duration: 180,
          includeHiddenNodes: true,
        });
      });
    },
    [reactFlowInstance],
  );

  const getSpawnPosition = useCallback(
    (index: number): { x: number; y: number } => {
      if (!reactFlowInstance) {
        return {
          x: 80 + (index % 3) * 280,
          y: 80 + Math.floor(index / 3) * 240,
        };
      }
      const pane = globalThis.document?.querySelector(".react-flow__pane");
      if (!pane) {
        return {
          x: 80 + (index % 3) * 280,
          y: 80 + Math.floor(index / 3) * 240,
        };
      }
      const paneRect = pane.getBoundingClientRect();
      const center = reactFlowInstance.screenToFlowPosition({
        x: paneRect.left + paneRect.width * 0.5,
        y: paneRect.top + paneRect.height * 0.42,
      });
      return {
        x: center.x - 88 + (index % 3) * 260,
        y: center.y - 60 + Math.floor(index / 3) * 200,
      };
    },
    [reactFlowInstance],
  );

  const buildAutoEdge = useCallback(
    (
      sourceNodeId: string | null,
      targetNodeId: string,
      sourceHandleId?: string | null,
    ): BuilderEdge | null => {
      if (!sourceNodeId || sourceNodeId === TRIGGER_NODE_ID) {
        return null;
      }

      const sourceNode = nodes.find((node) => node.id === sourceNodeId);
      const sourceGraphNode = sourceNode?.data.graphNode;
      if (!sourceGraphNode || sourceGraphNode.kind === "terminal") {
        return null;
      }

      if (sourceGraphNode.kind === "condition") {
        if (sourceHandleId !== "true" && sourceHandleId !== "false") {
          return null;
        }

        const hasBranchEdge = edges.some(
          (edge) =>
            edge.source === sourceNodeId &&
            getEdgeBranch(edge) === sourceHandleId,
        );
        if (hasBranchEdge) return null;

        return {
          id: createNodeId("edge"),
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: sourceHandleId,
          type: "animated",
          data: { branch: sourceHandleId },
        } satisfies BuilderEdge;
      }

      if (edges.some((edge) => edge.source === sourceNodeId)) {
        return null;
      }

      return {
        id: createNodeId("edge"),
        source: sourceNodeId,
        target: targetNodeId,
        type: "animated",
      } satisfies BuilderEdge;
    },
    [edges, nodes],
  );

  const addNode = useCallback(
    (
      graphNode: WorkflowBuilderNode,
      options?: {
        sourceNodeId?: string | null | undefined;
        sourceHandleId?: string | null | undefined;
      },
    ) => {
      const graphNodeCount = nodes.filter(
        (n) => n.data.graphNode.kind !== "trigger",
      ).length;
      const nextNode = toFlowNode(graphNode, graphNodeCount, actionCatalog);

      const defaultSourceNodeId =
        selectedGraphNode &&
        selectedGraphNode.kind !== "trigger" &&
        selectedGraphNode.kind !== "terminal"
          ? selectedGraphNode.id
          : null;
      const sourceNodeId =
        options?.sourceNodeId === undefined
          ? defaultSourceNodeId
          : options.sourceNodeId;

      const autoEdge = buildAutoEdge(
        sourceNodeId,
        graphNode.id,
        options?.sourceHandleId,
      );

      const nextNodes = [...nodes, nextNode];
      const nextEdges = autoEdge ? [...edges, autoEdge] : edges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      emitChange(nextNodes, nextEdges);
      setSelectedNodeId(graphNode.id);
      focusNodeInViewport(graphNode.id);
    },
    [
      actionCatalog,
      buildAutoEdge,
      edges,
      emitChange,
      focusNodeInViewport,
      nodes,
      selectedGraphNode,
    ],
  );

  const createNodeFromRequest = useCallback(
    (request: WorkflowNodeCreationRequest) => {
      const graphNodeCount = nodes.filter(
        (n) => n.data.graphNode.kind !== "trigger",
      ).length;
      const position = request.position ?? getSpawnPosition(graphNodeCount);

      if (request.kind === "action") {
        const action = actionCatalog[0];
        if (!action) return;
        addNode(
          {
            id: createNodeId("action"),
            kind: "action",
            actionId: action.id,
            integrationKey: action.integrationKey,
            input: {},
            position,
          },
          {
            sourceNodeId: request.sourceNodeId,
            sourceHandleId: request.sourceHandleId,
          },
        );
        return;
      }

      if (request.kind === "wait") {
        addNode(
          {
            id: createNodeId("wait"),
            kind: "wait",
            wait: {
              mode: "relative",
              duration: "PT30M",
              offsetDirection: "after",
            },
            position,
          },
          {
            sourceNodeId: request.sourceNodeId,
            sourceHandleId: request.sourceHandleId,
          },
        );
        return;
      }

      if (request.kind === "condition") {
        addNode(
          {
            id: createNodeId("condition"),
            kind: "condition",
            guard: {
              combinator: "all",
              conditions: [createDefaultGuardCondition()],
            },
            position,
          },
          {
            sourceNodeId: request.sourceNodeId,
            sourceHandleId: request.sourceHandleId,
          },
        );
        return;
      }

      addNode(
        {
          id: createNodeId("terminal"),
          kind: "terminal",
          terminalType: "complete",
          position,
        },
        {
          sourceNodeId: request.sourceNodeId,
          sourceHandleId: request.sourceHandleId,
        },
      );
    },
    [actionCatalog, addNode, getSpawnPosition, nodes],
  );

  const updateSelectedNode = useCallback(
    (updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode) => {
      if (!selectedNodeId) return;
      setNodes((currentNodes) => {
        const nextNodes = updateNodeGraphData(
          currentNodes,
          selectedNodeId,
          updater,
          actionCatalog,
        );
        emitChange(nextNodes, edges);
        return nextNodes;
      });
    },
    [actionCatalog, edges, emitChange, selectedNodeId],
  );

  const handleNodesChange = useCallback(
    (nextNodes: BuilderNode[]) => {
      setNodes(nextNodes);
      emitChange(nextNodes, edges);
    },
    [edges, emitChange],
  );

  const handleEdgesChange = useCallback(
    (nextEdges: BuilderEdge[]) => {
      setEdges(nextEdges);
      emitChange(nodes, nextEdges);
    },
    [emitChange, nodes],
  );

  const handleSelectionChange = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      setInspectorOpen(true);
      setActiveTab("properties");
    }
  }, []);

  const graphNodeCount = useMemo(
    () => nodes.filter((n) => n.data.graphNode.kind !== "trigger").length,
    [nodes],
  );

  const emptyState =
    !readOnly && graphNodeCount === 0 ? (
      <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-4">
        <div className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-background/95 p-4 text-center shadow-sm backdrop-blur-sm">
          <p className="text-sm font-semibold">Start your workflow</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Right-click the canvas to add your first step.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-secondary/80"
              onClick={() => createNodeFromRequest({ kind: "action" })}
              disabled={actionCatalog.length === 0}
            >
              <HugeiconsIcon
                icon={Settings02Icon}
                className="size-3.5"
                strokeWidth={2}
              />
              Action
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-secondary/80"
              onClick={() => createNodeFromRequest({ kind: "wait" })}
            >
              <HugeiconsIcon
                icon={Clock01Icon}
                className="size-3.5"
                strokeWidth={2}
              />
              Wait
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-secondary/80"
              onClick={() => createNodeFromRequest({ kind: "condition" })}
            >
              <HugeiconsIcon
                icon={GitBranchIcon}
                className="size-3.5"
                strokeWidth={2}
              />
              Condition
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-secondary/80"
              onClick={() => createNodeFromRequest({ kind: "terminal" })}
            >
              <HugeiconsIcon
                icon={StopCircleIcon}
                className="size-3.5"
                strokeWidth={2}
              />
              Terminal
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative h-full">
      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        readOnly={readOnly}
        selectedNodeId={selectedNodeId}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onSelectionChange={handleSelectionChange}
        onInit={setReactFlowInstance}
        onCreateNode={createNodeFromRequest}
        hasActions={actionCatalog.length > 0}
        emptyState={emptyState}
      />

      <SidebarPanel
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasRunsTab={!!sidebarExtra}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
      >
        {activeTab === "properties" ? (
          <NodeConfigPanel
            selectedGraphNode={selectedGraphNode}
            actionCatalog={actionCatalog}
            availableTriggerEventTypes={availableTriggerEventTypes}
            onTriggerEventTypeChange={onTriggerEventTypeChange}
            graphNodes={normalizedDocument.nodes ?? []}
            graphEdges={normalizedDocument.edges ?? []}
            readOnly={readOnly}
            updateSelectedNode={updateSelectedNode}
          />
        ) : (
          <div>{sidebarExtra}</div>
        )}
      </SidebarPanel>
    </div>
  );
}
