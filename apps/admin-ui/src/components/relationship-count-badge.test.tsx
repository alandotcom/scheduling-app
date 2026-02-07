import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { RelationshipCountBadge } from "./relationship-count-badge";

afterEach(() => {
  cleanup();
});

describe("RelationshipCountBadge", () => {
  test("renders singular label for count of one", () => {
    render(<RelationshipCountBadge count={1} singular="appointment" />);
    expect(screen.getByText("1 appointment")).toBeTruthy();
  });

  test("renders default plural label for count greater than one", () => {
    render(<RelationshipCountBadge count={2} singular="appointment" />);
    expect(screen.getByText("2 appointments")).toBeTruthy();
  });

  test("renders custom plural label", () => {
    render(
      <RelationshipCountBadge count={3} singular="person" plural="people" />,
    );
    expect(screen.getByText("3 people")).toBeTruthy();
  });
});
