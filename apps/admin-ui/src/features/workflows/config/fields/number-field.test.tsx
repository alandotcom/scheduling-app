import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  FieldRenderProvider,
  type FieldRenderContextValue,
} from "./field-render-context";
import { NumberField } from "./number-field";

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

describe("NumberField", () => {
  test("seeds its value from config", () => {
    renderField(
      <NumberField
        field={{ key: "limit", label: "Limit", type: "number" }}
        config={{ limit: 3 }}
        onUpdateConfig={() => {}}
        onUpdateConfigBatch={() => {}}
      />,
    );

    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "3",
    );
  });

  test("commits its value through onUpdateConfig on blur", () => {
    const onUpdateConfig = mock(() => {});
    renderField(
      <NumberField
        field={{ key: "limit", label: "Limit", type: "number" }}
        config={{ limit: 7 }}
        onUpdateConfig={onUpdateConfig}
        onUpdateConfigBatch={() => {}}
      />,
    );

    fireEvent.blur(screen.getByRole("spinbutton"));

    expect(onUpdateConfig).toHaveBeenCalledWith("limit", "7");
  });
});
