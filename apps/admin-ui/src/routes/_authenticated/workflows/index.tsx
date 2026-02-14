import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  canManageWorkflowsForRole,
  WorkflowListPage,
} from "@/features/workflows/workflow-list-page";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";

export const Route = createFileRoute("/_authenticated/workflows/")({
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(orpc.workflows.list.queryOptions({})),
        queryClient.ensureQueryData(orpc.auth.me.queryOptions({})),
      ]),
    );
  },
  component: WorkflowsPage,
});

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to load workflows.";
}

function WorkflowsPage() {
  const workflowsQuery = useQuery({
    ...orpc.workflows.list.queryOptions({}),
    placeholderData: (previous) => previous,
  });
  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });

  const workflows = workflowsQuery.data ?? [];
  const isInitialLoading = workflowsQuery.isLoading && !workflowsQuery.data;
  const errorMessage = workflowsQuery.error
    ? resolveErrorMessage(workflowsQuery.error)
    : null;
  const canManageWorkflows = canManageWorkflowsForRole(
    authContextQuery.data?.role ?? null,
  );

  return (
    <WorkflowListPage
      workflows={workflows}
      isLoading={isInitialLoading}
      errorMessage={errorMessage}
      canManageWorkflows={canManageWorkflows}
    />
  );
}
