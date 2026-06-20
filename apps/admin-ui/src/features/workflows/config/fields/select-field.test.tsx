import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  FieldRenderProvider,
  type FieldRenderContextValue,
} from "./field-render-context";
import { SelectField } from "./select-field";

afterEach(() => {
  cleanup();
});

function renderField(
  ui: ReactElement,
  overrides: Partial<FieldRenderContextValue> = {},
) {
  return render(
    <FieldRenderProvider
      value={{
        expressionSuggestions: [],
        selectOptionsByKey: {},
        conditionValueOptionsByField: {},
        defaultTimezone: "America/New_York",
        configScopeKey: "test",
        fieldDefaults: {},
        ...overrides,
      }}
    >
      {ui}
    </FieldRenderProvider>,
  );
}

describe("SelectField", () => {
  test("shows a humanized fallback label for an unknown current value", () => {
    renderField(
      <SelectField
        field={{
          key: "channel",
          label: "Channel",
          type: "select",
          options: [{ value: "email", label: "Email" }],
        }}
        config={{ channel: "sms_text" }}
        onUpdateConfig={() => {}}
        onUpdateConfigBatch={() => {}}
      />,
    );

    expect(screen.getByText("Sms Text")).toBeTruthy();
  });

  test("resolves the selected label from context-provided options", () => {
    renderField(
      <SelectField
        field={{ key: "channel", label: "Channel", type: "select" }}
        config={{ channel: "email" }}
        onUpdateConfig={() => {}}
        onUpdateConfigBatch={() => {}}
      />,
      { selectOptionsByKey: { channel: [{ value: "email", label: "Email" }] } },
    );

    expect(screen.getByText("Email")).toBeTruthy();
  });
});
