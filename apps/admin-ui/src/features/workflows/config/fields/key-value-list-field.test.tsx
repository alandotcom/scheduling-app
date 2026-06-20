import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  FieldRenderProvider,
  type FieldRenderContextValue,
} from "./field-render-context";
import { KeyValueListField } from "./key-value-list-field";

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

describe("KeyValueListField", () => {
  test("adds a row and commits its key on blur", () => {
    const onUpdateConfig = mock(() => {});
    renderField(
      <KeyValueListField
        field={{
          key: "templateVariables",
          label: "Variables",
          type: "key_value_list",
          addButtonLabel: "Add variable",
          keyPlaceholder: "Key",
        }}
        config={{}}
        onUpdateConfig={onUpdateConfig}
        onUpdateConfigBatch={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    const keyInput = screen.getByPlaceholderText("Key");
    fireEvent.change(keyInput, { target: { value: "PRODUCT" } });
    fireEvent.blur(keyInput);

    expect(onUpdateConfig).toHaveBeenCalledWith("templateVariables", [
      { key: "PRODUCT", value: "" },
    ]);
  });

  test("removes a row and commits the empty list", () => {
    const onUpdateConfig = mock(() => {});
    renderField(
      <KeyValueListField
        field={{
          key: "templateVariables",
          label: "Variables",
          type: "key_value_list",
        }}
        config={{ templateVariables: [{ key: "PRODUCT", value: "Widget" }] }}
        onUpdateConfig={onUpdateConfig}
        onUpdateConfigBatch={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove variable" }));

    expect(onUpdateConfig).toHaveBeenCalledWith("templateVariables", []);
  });
});
