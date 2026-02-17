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

    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Resend")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();

    expect(screen.getByText("Wait")).toBeTruthy();
    expect(screen.getByText("Logger")).toBeTruthy();
    expect(screen.getByText("Send Resend")).toBeTruthy();
    expect(screen.getByText("Send Slack")).toBeTruthy();
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
      expect(screen.getByText("Send Resend")).toBeTruthy();
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
    expect(screen.queryByText("Send Resend")).toBeNull();

    fireEvent.click(screen.getByTestId("action-group-toggle-resend"));
    expect(screen.getByText("Send Resend")).toBeTruthy();
  });

  test("hides group and can reveal hidden groups", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    fireEvent.click(screen.getByTestId("action-group-menu-resend"));
    fireEvent.click(screen.getByTestId("action-group-hide-resend"));

    expect(screen.queryByText("Resend")).toBeNull();
    expect(screen.getByTestId("action-show-hidden-groups")).toBeTruthy();

    fireEvent.click(screen.getByTestId("action-show-hidden-groups"));
    expect(screen.getByText("Resend")).toBeTruthy();
  });

  test("toggles view mode and persists selection", () => {
    render(<ActionGrid onSelectAction={mock(() => {})} />);

    fireEvent.click(screen.getByTestId("action-view-mode-toggle"));

    expect(window.localStorage.getItem("workflow-action-grid-view-mode")).toBe(
      "grid",
    );
  });
});
