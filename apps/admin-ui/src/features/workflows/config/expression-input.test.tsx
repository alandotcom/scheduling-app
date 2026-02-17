import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExpressionInput } from "./expression-input";

afterEach(() => {
  cleanup();
});

describe("ExpressionInput", () => {
  test("renders styled autocomplete rows with active selection marker", () => {
    const { container } = render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[
          { value: "Webhook.triggered", type: "boolean", isDateTime: false },
          { value: "Webhook.timestamp", type: "string", isDateTime: true },
        ]}
        value=""
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.focus(textbox);
    textbox.textContent = "@Web";

    const firstTextNode = textbox.firstChild;
    if (!firstTextNode) {
      throw new Error("Expected contentEditable text node");
    }

    const range = document.createRange();
    range.setStart(firstTextNode, 4);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.input(textbox);

    const activeRow = container.querySelector(
      "[data-expression-suggestion-active='true']",
    );
    expect(activeRow).toBeTruthy();
    expect(activeRow?.querySelector("svg")).toBeTruthy();
    expect(screen.getAllByText("Webhook.").length).toBeGreaterThan(0);
    expect(screen.getByText("triggered")).toBeTruthy();
    expect(screen.getByText("string · date-time")).toBeTruthy();
  });

  test("renders interpolation references as inline tokens", () => {
    const { container } = render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="Check Webhook.data.startsAt and @Action1.createdAt"
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");

    expect(tokens.length).toBe(2);
    expect(tokens[0]?.textContent).toBe("Webhook.data.startsAt");
    expect(tokens[1]?.textContent).toBe("@Action1.createdAt");
  });

  test("only tokenizes valid interpolation references", () => {
    const { container } = render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="@webhook.data.startsAt and Webhook.data.startsAt"
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");

    expect(tokens.length).toBe(1);
    expect(tokens[0]?.textContent).toBe("Webhook.data.startsAt");
  });

  test("text after chip with space does not extend the chip", () => {
    const { container } = render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="Webhook.data.startsAt hello"
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");

    expect(tokens.length).toBe(1);
    expect(tokens[0]?.textContent).toBe("Webhook.data.startsAt");
  });

  test("badges have contentEditable=false for atomic behavior", () => {
    const { container } = render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="Before Webhook.data.startsAt after"
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");

    expect(tokens.length).toBe(1);
    expect(tokens[0]?.getAttribute("contenteditable")).toBe("false");
  });

  test("renders as a contentEditable textbox", () => {
    render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value=""
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox.getAttribute("contenteditable")).toBe("true");
    expect(textbox.getAttribute("aria-multiline")).toBe("false");
  });

  test("supports multiline textbox mode", () => {
    render(
      <ExpressionInput
        multiline
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="Line 1\nLine 2"
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox.getAttribute("aria-multiline")).toBe("true");
  });

  test("tokenizes references in multiline content", () => {
    const { container } = render(
      <ExpressionInput
        multiline
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value={"Line 1\n@Action1.createdAt\nLine 3"}
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.textContent).toBe("@Action1.createdAt");
  });
});
