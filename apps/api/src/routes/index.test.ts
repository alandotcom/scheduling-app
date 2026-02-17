import { describe, expect, test } from "bun:test";
import { uiRouter } from "./index.js";

describe("router cutover", () => {
  test("does not expose legacy workflows routes", () => {
    expect("workflows" in uiRouter).toBe(false);
  });
});
