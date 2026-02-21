/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createTestQueryClient } from "@/test-utils/render";

mock.module("@/features/workflows/create-workflow-dialog", () => ({
  CreateWorkflowDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div
      data-open={open ? "true" : "false"}
      data-testid="create-workflow-dialog"
    >
      {open ? (
        <button onClick={() => onOpenChange(false)} type="button">
          Close create dialog
        </button>
      ) : null}
    </div>
  ),
}));

const { WorkflowListPage } = await import("./workflow-list-page");

afterEach(() => {
  cleanup();
});

function renderWorkflowListPage(input?: { canManageWorkflows?: boolean }) {
  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowListPage
        journeys={[]}
        isLoading={false}
        errorMessage={null}
        canManageWorkflows={input?.canManageWorkflows ?? true}
        searchQuery=""
        onSearchQueryChange={mock(() => {})}
      />
    </QueryClientProvider>,
  );
}

describe("WorkflowListPage create dialog", () => {
  test("opens create dialog from New journey button", () => {
    renderWorkflowListPage({ canManageWorkflows: true });

    expect(screen.getByTestId("create-workflow-dialog").dataset.open).toBe(
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "New journey" }));

    expect(screen.getByTestId("create-workflow-dialog").dataset.open).toBe(
      "true",
    );
  });

  test("closes create dialog when dialog requests close", () => {
    renderWorkflowListPage({ canManageWorkflows: true });

    fireEvent.click(screen.getByRole("button", { name: "New journey" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close create dialog" }),
    );

    expect(screen.getByTestId("create-workflow-dialog").dataset.open).toBe(
      "false",
    );
  });

  test("hides New journey button for read-only roles", () => {
    renderWorkflowListPage({ canManageWorkflows: false });

    expect(screen.queryByRole("button", { name: "New journey" })).toBeNull();
  });
});
