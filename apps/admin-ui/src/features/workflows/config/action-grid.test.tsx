import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ActionGrid } from "./action-grid";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ActionGrid", () => {
  test("renders canonical grouped journey actions", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    expect(screen.getByTestId("action-group-toggle-system")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-resend")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-slack")).toBeTruthy();

    expect(screen.getByText("Wait")).toBeTruthy();
    expect(screen.getByText("Condition")).toBeTruthy();
    expect(screen.getByText("Logger")).toBeTruthy();
    expect(screen.getByText("Send Email")).toBeTruthy();
    expect(screen.getByText("Send Email Template")).toBeTruthy();
    expect(screen.getByText("Send Channel Message")).toBeTruthy();
    expect(screen.getByTestId("action-grid-category-logo-resend")).toBeTruthy();
    expect(screen.getByTestId("action-grid-category-logo-slack")).toBeTruthy();
    expect(
      screen.getByTestId("action-grid-action-logo-send-resend"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("action-grid-action-logo-send-resend-template"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("action-grid-action-logo-send-slack"),
    ).toBeTruthy();
    expect(screen.queryByText("send-message")).toBeNull();
  });

  test("filters actions by search query", async () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    const searchInput = screen.getByTestId(
      "action-search-input",
    ) as HTMLInputElement;

    fireEvent.change(searchInput, {
      target: { value: "resend" },
    });

    await waitFor(() => {
      expect(searchInput.value).toBe("resend");
      expect(screen.getByText("Send Email")).toBeTruthy();
    });
  });

  test("calls onSelectAction when action row is selected", () => {
    const onSelectAction = mock((_actionType: string) => {});
    render(<ActionGrid onSelectAction={onSelectAction} />);

    fireEvent.click(screen.getByTestId("action-option-send-resend"));

    expect(onSelectAction).toHaveBeenCalledWith("send-resend");
  });

  test("collapses and expands group rows", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    fireEvent.click(screen.getByTestId("action-group-toggle-resend"));
    expect(screen.queryByText("Send Email")).toBeNull();

    fireEvent.click(screen.getByTestId("action-group-toggle-resend"));
    expect(screen.getByText("Send Email")).toBeTruthy();
  });

  test("hides group and can reveal hidden groups", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    fireEvent.click(screen.getByTestId("action-group-menu-resend"));
    fireEvent.click(screen.getByTestId("action-group-hide-resend"));

    expect(screen.queryByTestId("action-group-toggle-resend")).toBeNull();
    expect(screen.getByTestId("action-show-hidden-groups")).toBeTruthy();

    fireEvent.click(screen.getByTestId("action-show-hidden-groups"));
    expect(screen.getByTestId("action-group-toggle-resend")).toBeTruthy();
  });

  test("toggles view mode and persists selection", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    fireEvent.click(screen.getByTestId("action-view-mode-toggle"));

    expect(window.localStorage.getItem("workflow-action-grid-view-mode")).toBe(
      "grid",
    );
  });
});
