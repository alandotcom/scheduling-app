import { createFileRoute } from "@tanstack/react-router";
import { WorkflowEditorShell } from "@/features/workflows/workflow-editor-shell";

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowEditorRoute,
});

function WorkflowEditorRoute() {
  const { workflowId } = Route.useParams();
  return <WorkflowEditorShell workflowId={workflowId} />;
}
