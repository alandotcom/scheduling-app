/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ClientRelationPickerModal } from "@/components/clients/client-relation-picker-modal";
import { orpc } from "@/lib/query";
import { createTestQueryClient } from "@/test-utils";

afterEach(() => {
  cleanup();
});

function seedClientsListQuery() {
  const queryClient = createTestQueryClient();
  const now = new Date();
  const clientsListQuery = orpc.clients.list.queryOptions({
    input: { limit: 50, search: undefined },
  });

  queryClient.setQueryData(clientsListQuery.queryKey, {
    items: [
      {
        id: "client-1",
        orgId: "test-org-id",
        firstName: "Violet",
        lastName: "Rippin",
        email: "violet@example.com",
        phone: "+14155552889",
        referenceId: null,
        relationshipCounts: { appointments: 0 },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "client-2",
        orgId: "test-org-id",
        firstName: "Etha",
        lastName: "Carter",
        email: "etha@example.com",
        phone: "+14155552893",
        referenceId: null,
        relationshipCounts: { appointments: 0 },
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextCursor: null,
    hasMore: false,
  });

  return queryClient;
}

describe("ClientRelationPickerModal layout", () => {
  test("keeps desktop selected pane mounted when there are no selections", () => {
    const queryClient = seedClientsListQuery();

    render(
      <QueryClientProvider client={queryClient}>
        <ClientRelationPickerModal
          open
          mode="multi"
          selectedIds={[]}
          selectedClientById={{}}
          onOpenChange={() => {}}
          onApply={() => {}}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("relation-picker-desktop-layout")).toBeTruthy();
    expect(screen.getByTestId("relation-picker-selected-pane")).toBeTruthy();
    expect(screen.getByText("Selected (0)")).toBeTruthy();
  });

  test("mobile selected filter shows selected-only list without removing desktop pane", () => {
    const queryClient = seedClientsListQuery();

    render(
      <QueryClientProvider client={queryClient}>
        <ClientRelationPickerModal
          open
          mode="multi"
          selectedIds={["client-2"]}
          selectedClientById={{
            "client-2": {
              id: "client-2",
              firstName: "Etha",
              lastName: "Carter",
              email: "etha@example.com",
              phone: "+14155552893",
            },
          }}
          onOpenChange={() => {}}
          onApply={() => {}}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Selected" }));

    expect(screen.getByTestId("relation-picker-selected-pane")).toBeTruthy();
    expect(screen.getByText("Selected (1)")).toBeTruthy();
    expect(screen.getAllByText("Etha Carter").length).toBeGreaterThan(0);
  });

  test("keeps unresolved selected IDs visible and removable", () => {
    const queryClient = seedClientsListQuery();
    let appliedIds: string[] = ["missing-client-id"];

    render(
      <QueryClientProvider client={queryClient}>
        <ClientRelationPickerModal
          open
          mode="multi"
          selectedIds={["missing-client-id"]}
          selectedClientById={{}}
          onOpenChange={() => {}}
          onApply={(ids) => {
            appliedIds = ids;
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Selected (1)")).toBeTruthy();
    expect(screen.getByText("Unknown client")).toBeTruthy();
    expect(screen.getByText("missing-client-id")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Unknown client/i }));
    expect(screen.getByText("Selected (0)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(appliedIds).toEqual([]);
  });
});
