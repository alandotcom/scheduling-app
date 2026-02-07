import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { ResourceForm } from "./resources";

afterEach(() => {
  cleanup();
});

describe("ResourceForm select value labels", () => {
  test("shows a friendly fallback for stale location ids", () => {
    render(
      <ResourceForm
        defaultValues={{
          name: "Exam Room",
          quantity: 1,
          locationId: "loc-stale-123",
        }}
        locations={[{ id: "loc-1", name: "Main Office" }]}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
      />,
    );

    expect(screen.getByText("Unknown location")).toBeTruthy();
    expect(screen.queryByText("loc-stale-123")).toBeNull();
  });
});
