import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { closeTestDb, createTestDb } from "./test-utils.js";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe("test bootstrap migrations", () => {
  test("creates appointment capacity function and triggers from migrations", async () => {
    const functions = await db.execute(sql`
      SELECT proname
      FROM pg_proc
      WHERE proname = 'check_appointment_capacity'
    `);
    expect(functions).toHaveLength(1);

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

    expect(triggers.map((row) => row["tgname"])).toEqual([
      "check_appointment_capacity_insert",
      "check_appointment_capacity_update",
    ]);
  });
});
