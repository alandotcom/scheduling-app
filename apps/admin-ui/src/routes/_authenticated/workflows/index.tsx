import { createFileRoute } from "@tanstack/react-router";
import { WorkflowListPage } from "@/features/workflows/workflow-list-page";

export const Route = createFileRoute("/_authenticated/workflows/")({
  component: WorkflowListPage,
});
