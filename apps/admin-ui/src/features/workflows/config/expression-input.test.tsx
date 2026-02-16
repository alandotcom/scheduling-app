import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ExpressionInput } from "./expression-input";

afterEach(() => {
  cleanup();
});

describe("ExpressionInput", () => {
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

  test("treats token as atomic on backspace", () => {
    function Harness() {
      const [value, setValue] = useState("Before Webhook.data.startsAt after");

      return (
        <ExpressionInput
          onBlur={() => {}}
          onChange={setValue}
          suggestions={[]}
          value={value}
        />
      );
    }

    render(<Harness />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    const tokenEnd = "Before Webhook.data.startsAt".length;
    input.focus();
    input.setSelectionRange(tokenEnd, tokenEnd);

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(input.value).toBe("Before  after");
  });

  test("typing at chip boundary inserts a space before the character", () => {
    function Harness() {
      const [value, setValue] = useState("Before Webhook.data.startsAt");

      return (
        <ExpressionInput
          onBlur={() => {}}
          onChange={setValue}
          suggestions={[]}
          value={value}
        />
      );
    }

    render(<Harness />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    const tokenEnd = "Before Webhook.data.startsAt".length;
    input.focus();
    input.setSelectionRange(tokenEnd, tokenEnd);

    fireEvent.keyDown(input, { key: "x" });

    expect(input.value).toBe("Before Webhook.data.startsAt x");
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

  test("snaps selection out of the middle of a token", () => {
    render(
      <ExpressionInput
        onBlur={() => {}}
        onChange={() => {}}
        suggestions={[]}
        value="Before Webhook.data.startsAt after"
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    const insideToken = "Before Webhook.da".length;

    input.focus();
    input.setSelectionRange(insideToken, insideToken);
    fireEvent.select(input);

    const tokenEnd = "Before Webhook.data.startsAt".length;
    expect(input.selectionStart).toBe(tokenEnd);
    expect(input.selectionEnd).toBe(tokenEnd);
  });
});
