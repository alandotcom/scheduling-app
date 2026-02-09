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
import { sql, eq } from "drizzle-orm";
import { ApiException } from "svix";
import { eventOutbox } from "@scheduling/db/schema";
import {
  closeTestDb,
  createOrg,
  createTestDb,
  resetTestDb,
  type TestDatabase,
} from "../../test-utils/index.js";
import type { DomainEvent } from "./types.js";
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
  event: DomainEvent,
  options: { attemptsMade?: number; attempts?: number } = {},
): Job<DomainEvent> {
  return {
    id: event.id,
    data: event,
    attemptsMade: options.attemptsMade ?? 0,
    opts: {
      attempts: options.attempts ?? 3,
    },
  } as Job<DomainEvent>;
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

  test("retries without publishing when outbox row is not claimable", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const publishEvent = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await expect(
        processEventJob(job, {
          dbClient: tx,
          publishEvent,
          now: () => new Date("2026-02-09T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ name: "OutboxRowNotReadyError" });
    });

    expect(publishEvent).not.toHaveBeenCalled();
  });

  test("skips publish on final attempt when outbox row is still not claimable", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 2, attempts: 3 });
    const publishEvent = mock(async () => {});

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${org.id}, true)`,
      );

      await processEventJob(job, {
        dbClient: tx,
        publishEvent,
        now: () => new Date("2026-02-09T00:00:00.000Z"),
      });

      const rows = await tx
        .select({ id: eventOutbox.id })
        .from(eventOutbox)
        .where(eq(eventOutbox.id, event.id));
      expect(rows).toHaveLength(0);
    });

    expect(publishEvent).not.toHaveBeenCalled();
  });

  test("claims pending outbox row and marks it delivered after publish", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const publishEvent = mock(async () => {});

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
        publishEvent,
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

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledWith({
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  });

  test("marks row delivered when Svix returns conflict for an already-published event", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const publishEvent = mock(async () => {
      throw new ApiException(409, { message: "Conflict" }, new Headers());
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

      await processEventJob(job, {
        dbClient: tx,
        publishEvent,
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

    expect(publishEvent).toHaveBeenCalledTimes(1);
  });

  test("default worker DB path is RLS-safe without injected db client", async () => {
    const { org } = await createOrg(db);
    const event = createEvent({ orgId: org.id });
    const job = createJob(event, { attemptsMade: 0, attempts: 3 });
    const publishEvent = mock(async () => {});

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
      publishEvent,
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
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledWith({
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  });
});
