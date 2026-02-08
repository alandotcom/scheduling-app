import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedSecondTestOrg,
  seedTestOrg,
  setTestOrgContext,
} from "./test-utils.js";
import { clients } from "./schema/index.js";
import type * as schema from "./schema/index.js";
import type { relations } from "./relations.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("clients table constraints", () => {
  let db: Database;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  test("accepts valid E.164 phone format", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    const [client] = await db
      .insert(clients)
      .values({
        orgId: org.id,
        firstName: "Valid",
        lastName: "Phone",
        phone: "+14155552671",
      })
      .returning();

    expect(client).toBeDefined();
    expect(client?.phone).toBe("+14155552671");
  });

  test("rejects non-E.164 phone format via CHECK constraint", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    await expect(
      db
        .insert(clients)
        .values({
          orgId: org.id,
          firstName: "Invalid",
          lastName: "Phone",
          phone: "415-555-2671",
        })
        .returning(),
    ).toRejectWith(/clients_phone_e164_check/);
  });

  test("allows multiple null phone values", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    await db
      .insert(clients)
      .values({
        orgId: org.id,
        firstName: "Null",
        lastName: "PhoneOne",
        phone: null,
      })
      .returning();

    await db
      .insert(clients)
      .values({
        orgId: org.id,
        firstName: "Null",
        lastName: "PhoneTwo",
        phone: null,
      })
      .returning();

    const rows = await db.query.clients.findMany();
    expect(rows).toHaveLength(2);
  });

  test("enforces unique phone per org", async () => {
    const { org: org1 } = await seedTestOrg(db);
    const { org: org2 } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, org1.id);
    await db
      .insert(clients)
      .values({
        orgId: org1.id,
        firstName: "Org1",
        lastName: "Client",
        phone: "+14155552671",
      })
      .returning();

    await expect(
      db
        .insert(clients)
        .values({
          orgId: org1.id,
          firstName: "Org1",
          lastName: "Duplicate",
          phone: "+14155552671",
        })
        .returning(),
    ).toRejectWith(/clients_org_phone_unique_idx/);

    await setTestOrgContext(db, org2.id);
    const [crossOrgInsert] = await db
      .insert(clients)
      .values({
        orgId: org2.id,
        firstName: "Org2",
        lastName: "Allowed",
        phone: "+14155552671",
      })
      .returning();

    expect(crossOrgInsert).toBeDefined();
    expect(crossOrgInsert?.orgId).toBe(org2.id);
  });

  test("enforces case-insensitive unique email per org", async () => {
    const { org: org1 } = await seedTestOrg(db);
    const { org: org2 } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, org1.id);
    await db
      .insert(clients)
      .values({
        orgId: org1.id,
        firstName: "Email",
        lastName: "Owner",
        email: "John@Example.com",
      })
      .returning();

    await expect(
      db
        .insert(clients)
        .values({
          orgId: org1.id,
          firstName: "Email",
          lastName: "Duplicate",
          email: "john@example.com",
        })
        .returning(),
    ).toRejectWith(/clients_org_email_unique_idx/);

    await setTestOrgContext(db, org2.id);
    const [crossOrgInsert] = await db
      .insert(clients)
      .values({
        orgId: org2.id,
        firstName: "Email",
        lastName: "Allowed",
        email: "john@example.com",
      })
      .returning();

    expect(crossOrgInsert).toBeDefined();
    expect(crossOrgInsert?.orgId).toBe(org2.id);
  });
});
