/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EntityListEmptyState } from "./entity-list";

afterEach(() => {
  cleanup();
});

describe("EntityListEmptyState", () => {
  test("renders message-only content when no action is provided", () => {
    render(<EntityListEmptyState>No resources yet.</EntityListEmptyState>);

    expect(screen.getByText("No resources yet.")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders create action when action is provided", () => {
    render(
      <EntityListEmptyState actionLabel="Create Resource" onAction={() => {}}>
        No resources yet. Create your first resource to get started.
      </EntityListEmptyState>,
    );

    expect(
      screen.getByRole("button", { name: "Create Resource" }),
    ).toBeDefined();
  });

  test("calls action callback when create button is clicked", () => {
    const onAction = mock(() => {});

    render(
      <EntityListEmptyState actionLabel="Create Client" onAction={onAction}>
        No clients yet.
      </EntityListEmptyState>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Client" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
