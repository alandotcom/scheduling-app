import { describe, expect, test } from "bun:test";

import { resolveSelectValueLabel } from "./select-value-label";

type Option = {
  id: string;
  label: string;
};

const OPTIONS: Option[] = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
];

describe("resolveSelectValueLabel", () => {
  test("returns undefined when value is empty", () => {
    expect(
      resolveSelectValueLabel({
        value: "",
        options: OPTIONS,
        getOptionValue: (option) => option.id,
        getOptionLabel: (option) => option.label,
      }),
    ).toBeUndefined();

    expect(
      resolveSelectValueLabel({
        value: undefined,
        options: OPTIONS,
        getOptionValue: (option) => option.id,
        getOptionLabel: (option) => option.label,
      }),
    ).toBeUndefined();
  });

  test("returns none label for sentinel none value", () => {
    expect(
      resolveSelectValueLabel({
        value: "none",
        options: OPTIONS,
        getOptionValue: (option) => option.id,
        getOptionLabel: (option) => option.label,
        noneLabel: "No location",
      }),
    ).toBe("No location");
  });

  test("returns matched option label", () => {
    expect(
      resolveSelectValueLabel({
        value: "two",
        options: OPTIONS,
        getOptionValue: (option) => option.id,
        getOptionLabel: (option) => option.label,
      }),
    ).toBe("Two");
  });

  test("returns unknown label when value is unmatched", () => {
    expect(
      resolveSelectValueLabel({
        value: "stale-id",
        options: OPTIONS,
        getOptionValue: (option) => option.id,
        getOptionLabel: (option) => option.label,
        unknownLabel: "Unknown location",
      }),
    ).toBe("Unknown location");
  });
});
