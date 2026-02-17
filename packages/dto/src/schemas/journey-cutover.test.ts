import { describe, expect, test } from "bun:test";
import * as schemas from "./index";

describe("journey cutover schema exports", () => {
  test("does not expose legacy workflow schema exports", () => {
    expect("createWorkflowSchema" in schemas).toBe(false);
    expect("workflowExecutionSchema" in schemas).toBe(false);
  });
});
