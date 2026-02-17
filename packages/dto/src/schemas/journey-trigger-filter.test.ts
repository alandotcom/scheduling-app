import { describe, expect, test } from "bun:test";
import { journeyTriggerFilterAstSchema } from "./workflow-graph";

function buildCondition(index: number) {
  return {
    field: `appointment.customField${index}`,
    operator: "equals" as const,
    value: `value-${index}`,
  };
}

describe("journey trigger filter AST schema", () => {
  test("accepts one-level grouped filters within caps", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.status",
              operator: "equals",
              value: "scheduled",
            },
          ],
        },
        {
          logic: "or",
          conditions: [
            {
              field: "client.email",
              operator: "is_set",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects more than four groups", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: Array.from({ length: 5 }, (_, index) => ({
        logic: "and",
        conditions: [buildCondition(index)],
      })),
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) => issue.path[0] === "groups"),
      ).toBe(true);
    }
  });

  test("rejects more than twelve total conditions across groups", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            buildCondition(1),
            buildCondition(2),
            buildCondition(3),
            buildCondition(4),
          ],
        },
        {
          logic: "and",
          conditions: [
            buildCondition(5),
            buildCondition(6),
            buildCondition(7),
            buildCondition(8),
          ],
        },
        {
          logic: "and",
          conditions: [
            buildCondition(9),
            buildCondition(10),
            buildCondition(11),
            buildCondition(12),
            buildCondition(13),
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (issue) =>
            issue.path[0] === "groups" &&
            issue.message.includes("cannot contain more than 12 conditions"),
        ),
      ).toBe(true);
    }
  });

  test("rejects incompatible field/operator combinations with structured issues", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startsAt",
              operator: "contains",
              value: "2026",
            },
            {
              field: "client.email",
              operator: "before",
              value: "2026-02-16T10:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["groups", 0, "conditions", 0, "operator"],
          }),
          expect.objectContaining({
            path: ["groups", 0, "conditions", 1, "operator"],
          }),
        ]),
      );
    }
  });

  test("accepts relative temporal operator payloads for temporal fields", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startAt",
              operator: "within_next",
              value: {
                amount: 2,
                unit: "weeks",
              },
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects invalid relative temporal values", () => {
    const parsed = journeyTriggerFilterAstSchema.safeParse({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startAt",
              operator: "within_next",
              value: {
                amount: 0,
                unit: "days",
              },
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (issue) =>
            issue.path[0] === "groups" && issue.path.at(-1) === "value",
        ),
      ).toBe(true);
    }
  });
});
