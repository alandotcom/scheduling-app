import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import { ClientsListPresentation } from "./clients-list-presentation";

interface TestClient {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  referenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relationshipCounts: {
    appointments: number;
  };
}

afterEach(() => {
  cleanup();
});

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createClient = (
  id: string,
  firstName: string,
  lastName: string,
): TestClient => {
  return {
    id,
    orgId: "org-1",
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    phone: "+12065550123",
    referenceId: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
    relationshipCounts: {
      appointments: 1,
    },
  };
};

describe("ClientsListPresentation", () => {
  test("prefetches client details on hover intent", async () => {
    const onHoverIntent = mock(() => {});
    const clients = [createClient("client-1", "Jane", "Smith")];
    const { container } = render(
      <ClientsListPresentation
        clients={clients}
        onOpen={() => {}}
        onHoverIntent={onHoverIntent}
        getActions={() => []}
      />,
    );

    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
    if (!row) return;

    fireEvent.mouseEnter(row);

    await waitFor(
      () => {
        expect(onHoverIntent).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );
    expect(onHoverIntent).toHaveBeenCalledWith("client-1");
  });

  test("does not prefetch client details when hover leaves before intent delay", async () => {
    const onHoverIntent = mock(() => {});
    const clients = [createClient("client-1", "Jane", "Smith")];
    const { container } = render(
      <ClientsListPresentation
        clients={clients}
        onOpen={() => {}}
        onHoverIntent={onHoverIntent}
        getActions={() => []}
      />,
    );

    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
    if (!row) return;

    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    await sleep(350);

    expect(onHoverIntent).not.toHaveBeenCalled();
  });

  test("prefetches only the last hovered client when moving rows quickly", async () => {
    const onHoverIntent = mock(() => {});
    const clients = [
      createClient("client-1", "Jane", "Smith"),
      createClient("client-2", "John", "Doe"),
    ];
    const { container } = render(
      <ClientsListPresentation
        clients={clients}
        onOpen={() => {}}
        onHoverIntent={onHoverIntent}
        getActions={() => []}
      />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);

    const firstRow = rows.item(0);
    const secondRow = rows.item(1);
    if (!firstRow || !secondRow) return;

    fireEvent.mouseEnter(firstRow);
    await sleep(100);
    fireEvent.mouseEnter(secondRow);

    await waitFor(
      () => {
        expect(onHoverIntent).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );
    expect(onHoverIntent).toHaveBeenCalledWith("client-2");
  });
});
