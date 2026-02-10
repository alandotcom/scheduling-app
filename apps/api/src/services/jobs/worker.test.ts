import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import {
  createIntegration,
  type IntegrationName,
  type IntegrationConsumer,
} from "@integrations/core";
import { eventOutbox } from "@scheduling/db/schema";
import {
  closeTestDb,
  createOrg,
  createTestDb,
  resetTestDb,
  type TestDatabase,
} from "../../test-utils/index.js";
import type { AnyDomainEvent, DomainEvent } from "./types.js";
import { processEventJob } from "./worker.js";

function createEvent(
  overrides: Partial<DomainEvent<"appointment.created">> = {},
): DomainEvent<"appointment.created"> {
  return {
    id: Bun.randomUUIDv7(),
    type: "appointment.created",
    orgId: Bun.randomUUIDv7(),
    payload: {
      appointmentId: Bun.randomUUIDv7(),
      calendarId: Bun.randomUUIDv7(),
      appointmentTypeId: Bun.randomUUIDv7(),
      clientId: Bun.randomUUIDv7(),
      startAt: new Date("2026-02-09T00:00:00.000Z").toISOString(),
      endAt: new Date("2026-02-09T00:30:00.000Z").toISOString(),
      timezone: "America/New_York",
      status: "scheduled",
    },
    timestamp: new Date("2026-02-09T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function createJob(
  event: AnyDomainEvent,
  options: { attemptsMade?: number; attempts?: number } = {},
): Job<AnyDomainEvent> {
  return {
    id: event.id,
    data: event,
    attemptsMade: options.attemptsMade ?? 0,
    opts: {
      attempts: options.attempts ?? 3,
    },
  } as Job<AnyDomainEvent>;
}

function createTestIntegration(name: IntegrationName): IntegrationConsumer {
  return createIntegration({
    name,
    supportedEventTypes: ["*"],
    async process() {},
  });
}

describe("Event Worker", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  test("retries without fanout enqueue when outbox row is not claimable", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const enqueueFanout = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await expect(
        processEventJob(job, {
          dbClient: tx,
          enqueueFanout,
          integrations: [createTestIntegration("logger")],
          now: () => new Date("2026-02-09T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ name: "OutboxRowNotReadyError" });
    });

    expect(enqueueFanout).not.toHaveBeenCalled();
  });

  test("skips fanout enqueue on final attempt when outbox row is still not claimable", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 2, attempts: 3 });
    const enqueueFanout = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await processEventJob(job, {
        dbClient: tx,
        enqueueFanout,
        integrations: [createTestIntegration("logger")],
        now: () => new Date("2026-02-09T00:00:00.000Z"),
      });

      const rows = await tx
        .select({ id: eventOutbox.id })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));
      expect(rows).toHaveLength(0);
    });

    expect(enqueueFanout).not.toHaveBeenCalled();
  });

  test("claims pending outbox row, enqueues fanout, and marks it delivered", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const integrations = [
      createTestIntegration("svix"),
      createTestIntegration("logger"),
    ];
    const enqueueFanout = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await tx.insert(eventOutbox).values({
        id: event.id,
        orgId: org.id,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        status: "pending",
        nextAttemptAt: new Date("2026-02-09T00:00:00.000Z"),
      });

      await processEventJob(job, {
        dbClient: tx,
        enqueueFanout,
        integrations,
        now: () => new Date("2026-02-09T00:00:00.000Z"),
      });

      const [row] = await tx
        .select({
          status: eventOutbox.status,
          nextAttemptAt: eventOutbox.nextAttemptAt,
        })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));

      expect(row?.status).toBe("delivered");
      expect(row?.nextAttemptAt).toBeNull();
    });

    expect(enqueueFanout).toHaveBeenCalledTimes(1);
    expect(enqueueFanout).toHaveBeenCalledWith(event, integrations);
  });

  test("marks row delivered when no integrations are enabled", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const enqueueFanout = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await tx.insert(eventOutbox).values({
        id: event.id,
        orgId: org.id,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        status: "pending",
        nextAttemptAt: new Date("2026-02-09T00:00:00.000Z"),
      });

      await processEventJob(job, {
        dbClient: tx,
        enqueueFanout,
        integrations: [],
        now: () => new Date("2026-02-09T00:00:00.000Z"),
      });

      const [row] = await tx
        .select({ status: eventOutbox.status })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));

      expect(row?.status).toBe("delivered");
    });

    expect(enqueueFanout).not.toHaveBeenCalled();
  });

  test("sets row back to pending and schedules retry when fanout enqueue fails", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const enqueueFanout = mock(async () => {
      throw new Error("redis unavailable");
    });

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await tx.insert(eventOutbox).values({
        id: event.id,
        orgId: org.id,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        status: "pending",
        nextAttemptAt: new Date("2026-02-09T00:00:00.000Z"),
      });

      await expect(
        processEventJob(job, {
          dbClient: tx,
          enqueueFanout,
          integrations: [createTestIntegration("logger")],
          now: () => new Date("2026-02-09T00:00:00.000Z"),
        }),
      ).rejects.toThrow("redis unavailable");

      const [row] = await tx
        .select({
          status: eventOutbox.status,
          nextAttemptAt: eventOutbox.nextAttemptAt,
        })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));

      expect(row?.status).toBe("pending");
      expect(row?.nextAttemptAt?.toISOString()).toBe(
        "2026-02-09T00:00:01.000Z",
      );
    });
  });

  test("marks row failed when retries are exhausted", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 2, attempts: 3 });
    const enqueueFanout = mock(async () => {
      throw new Error("redis unavailable");
    });

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await tx.insert(eventOutbox).values({
        id: event.id,
        orgId: org.id,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        status: "pending",
        nextAttemptAt: new Date("2026-02-09T00:00:00.000Z"),
      });
    });

    await expect(
      processEventJob(job, {
        enqueueFanout,
        integrations: [createTestIntegration("logger")],
        now: () => new Date("2026-02-09T00:00:00.000Z"),
      }),
    ).rejects.toThrow("redis unavailable");

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );
      const [row] = await tx
        .select({
          status: eventOutbox.status,
          nextAttemptAt: eventOutbox.nextAttemptAt,
        })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));

      expect(row?.status).toBe("failed");
      expect(row?.nextAttemptAt).toBeNull();
    });
  });

  test("default worker DB path is RLS-safe without injected db client", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const enqueueFanout = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await tx.insert(eventOutbox).values({
        id: event.id,
        orgId: org.id,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        status: "pending",
        nextAttemptAt: new Date("2026-02-09T00:00:00.000Z"),
      });
    });

    await processEventJob(job, {
      enqueueFanout,
      integrations: [],
      now: () => new Date("2026-02-09T00:00:00.000Z"),
    });

    const [row] = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      const rows = await tx
        .select({
          status: eventOutbox.status,
          nextAttemptAt: eventOutbox.nextAttemptAt,
        })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));

      return rows;
    });

    expect(row?.status).toBe("delivered");
    expect(row?.nextAttemptAt).toBeNull();
    expect(enqueueFanout).not.toHaveBeenCalled();
  });
});
