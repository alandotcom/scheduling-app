import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowGraphDocument } from "@scheduling/dto";
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
import { canonicalGraphToReferenceGraph } from "@/lib/workflows/reference-adapter";
import { orpc } from "@/lib/query";
// eslint-disable-next-line import/no-unassigned-import
import "@xyflow/react/dist/style.css";

function resolveNodeLabel(node: {
  id: string;
  type: string;
  data?: { label?: string; config?: Record<string, unknown> };
}): string {
  if (node.type === "trigger") {
    const triggerType = node.data?.config?.["triggerType"];
    if (typeof triggerType === "string" && triggerType.length > 0) {
      return triggerType;
    }
    return "Trigger";
  }

  if (typeof node.data?.label === "string" && node.data.label.length > 0) {
    return node.data.label;
  }

  return node.id;
}

function buildTriggerSummary(graph: WorkflowGraphDocument): string {
  const trigger = graph.trigger;
  if (!trigger) {
    return "No trigger configured";
  }

  if (trigger.type === "schedule") {
    return `Schedule: ${trigger.expression} (${trigger.timezone})`;
  }

  return `Domain: ${trigger.domain} (${(trigger.startEvents ?? []).length} start / ${(trigger.restartEvents ?? []).length} restart / ${(trigger.stopEvents ?? []).length} stop)`;
}

function toFlowElements(
  graph: WorkflowGraphDocument,
): { nodes: Node[]; edges: Edge[] } {
  const reference = canonicalGraphToReferenceGraph(graph);

  const nodes: Node[] = reference.nodes.map((node, index) => ({
    id: node.id,
    position: node.position ?? { x: index * 220, y: 80 },
    data: { label: resolveNodeLabel(node) },
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  const edges: Edge[] = reference.edges.map((edge) => {
    const branch =
      typeof edge.data?.["branch"] === "string" ? edge.data.branch : undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      ...(branch ? { label: branch } : {}),
    };
  });

  return { nodes, edges };
}

interface WorkflowEditorShellProps {
  workflowId: string;
}

export function WorkflowEditorShell({ workflowId }: WorkflowEditorShellProps) {
  const definitionQuery = useQuery(
    orpc.workflows.getDefinition.queryOptions({
      input: { id: workflowId },
    }),
  );
  const catalogQuery = useQuery(orpc.workflows.catalog.queryOptions());

  const flow = useMemo(() => {
    if (!definitionQuery.data) {
      return { nodes: [], edges: [] };
    }
    return toFlowElements(definitionQuery.data.draftWorkflowGraph);
  }, [definitionQuery.data]);

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
  const triggerSummary = buildTriggerSummary(workflow.draftWorkflowGraph);

  return (
    <section className="flex h-full min-h-full w-full min-w-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/workflows">
                <Icon icon={ArrowLeft01Icon} className="size-4" />
                Back
              </Link>
            </Button>
            <Badge variant={workflow.status === "active" ? "default" : "warning"}>
              {workflow.status}
            </Badge>
          </div>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {workflow.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {workflow.description || "No description"}
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Revision {workflow.draftRevision}</p>
          <p>Updated {new Date(workflow.updatedAt).toLocaleString()}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 bg-muted/20">
          <div className="h-full w-full">
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              fitView
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              className="h-full w-full"
            >
              <Background />
              <MiniMap pannable zoomable />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>

        <aside className="hidden h-full w-[320px] shrink-0 space-y-4 overflow-y-auto border-l border-border bg-background p-4 xl:block">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trigger</CardTitle>
              <CardDescription>{triggerSummary}</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Graph Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Nodes:</span>{" "}
                {workflow.draftWorkflowGraph.nodes.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Edges:</span>{" "}
                {workflow.draftWorkflowGraph.edges.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Bindings:</span>{" "}
                {workflow.bindings.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Schedules:</span>{" "}
                {workflow.scheduleBindings.length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Catalog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Triggers:</span>{" "}
                {catalogQuery.data?.triggers.length ?? 0}
              </p>
              <p>
                <span className="font-medium text-foreground">Actions:</span>{" "}
                {catalogQuery.data?.actions.length ?? 0}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
