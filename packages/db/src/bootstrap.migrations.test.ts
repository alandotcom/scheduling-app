import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getTestDb } from "./test-utils.js";

const db = getTestDb();

function resultRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

describe("test bootstrap migrations", () => {
  test("creates appointment capacity function and triggers from migrations", async () => {
    const functions = await db.execute(sql`
      SELECT proname
      FROM pg_proc
      WHERE proname = 'check_appointment_capacity'
    `);
    const functionRows = resultRows<{ proname: string }>(functions);
    expect(functionRows).toHaveLength(1);

    const triggers = await db.execute(sql`
      SELECT tgname
      FROM pg_trigger t
      INNER JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'appointments'
        AND NOT t.tgisinternal
        AND tgname IN (
          'check_appointment_capacity_insert',
          'check_appointment_capacity_update'
        )
      ORDER BY tgname
    `);

    const triggerRows = resultRows<{ tgname: string }>(triggers);

    expect(triggerRows.map((row) => row.tgname)).toEqual([
      "check_appointment_capacity_insert",
      "check_appointment_capacity_update",
    ]);
  });
});
