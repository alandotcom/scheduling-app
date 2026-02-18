/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";

import { AppointmentModal } from "@/components/appointment-modal";
import { orpc } from "@/lib/query";
import { createTestQueryClient } from "@/test-utils";

afterEach(() => {
  cleanup();
});

describe("AppointmentModal client autocomplete", () => {
  test("shows full recent client list when selected label matches search text", async () => {
    const now = new Date();
    const selectedClient = {
      id: "client-new",
      orgId: "test-org-id",
      firstName: "New",
      lastName: "Guy",
      email: "newguy@example.com",
      phone: null,
      referenceId: null,
      relationshipCounts: { appointments: 0 },
      createdAt: now,
      updatedAt: now,
    };
    const olderClientA = {
      id: "client-jane",
      orgId: "test-org-id",
      firstName: "Jane",
      lastName: "Roe",
      email: "jane@example.com",
      phone: null,
      referenceId: null,
      relationshipCounts: { appointments: 0 },
      createdAt: now,
      updatedAt: now,
    };
    const olderClientB = {
      id: "client-max",
      orgId: "test-org-id",
      firstName: "Max",
      lastName: "Poe",
      email: "max@example.com",
      phone: null,
      referenceId: null,
      relationshipCounts: { appointments: 0 },
      createdAt: now,
      updatedAt: now,
    };

    const queryClient = createTestQueryClient();
    const clientsListQuery = orpc.clients.list.queryOptions({
      input: { limit: 100, sort: "updated_at_desc" },
    });
    queryClient.setQueryData(clientsListQuery.queryKey, {
      items: [selectedClient, olderClientA, olderClientB],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppointmentModal
          open
          onOpenChange={() => {}}
          defaultClientId={selectedClient.id}
          defaultClientName={`${selectedClient.firstName} ${selectedClient.lastName}`}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain("Jane Roe");
      expect(document.body.textContent).toContain("Max Poe");
    });
  });
});
