# pg-boss Deep Research for `scheduling-app`

**Date:** 2026-02-10  
**Scope requested:** queue model, pub/sub APIs, delivery guarantees, retries/backoff, dead letters, scheduling, throughput, operational behavior, multi-tenant patterns, and BullMQ migration fit.

## Executive Summary

`pg-boss` is a strong architectural fit for this project’s Postgres-first direction, especially since you already use an `event_outbox` table and are moving toward a Postgres-centric event/workflow runtime. It provides queueing, pub/sub fanout, retries, dead letters, scheduling, and operational controls in PostgreSQL, with built-in multi-node coordination primitives.[1][2][5][7][8]

For this codebase specifically, it is feasible to replace BullMQ fanout with `pg-boss` pub/sub plus queue workers, but there are critical deltas to plan for:

1. **Runtime compatibility risk:** official `pg-boss` targets Node `>=22.12.0`; your runtime standard is Bun.[1][15]
2. **Delivery semantics are different in practice:** `pg-boss` documents exactly-once queue delivery semantics via `SKIP LOCKED`, but external side effects are still effectively at-least-once unless you enforce idempotency at handler boundaries.[1][2][10][16]
3. **Pub/sub publish behavior is best-effort unless wrapped:** `publish()` uses `Promise.allSettled` internally; failures can be swallowed unless you add explicit checks.[5][11]
4. **Flow/DAG gap vs current BullMQ usage:** BullMQ `FlowProducer` parent/child lifecycle semantics do not have a direct built-in equivalent in `pg-boss` pub/sub.[21]
5. **Retention defaults differ materially from current BullMQ behavior:** `pg-boss` time-based retention defaults (7–14 days) are much “stickier” than your current `removeOnComplete/removeOnFail` count-based settings.[3][6]

Overall recommendation: adopt `pg-boss`, but do it with a phased migration and explicit guardrails around runtime support, publish error handling, idempotency, and observability replacement.

---

## Project Context Snapshot (Current BullMQ Design)

From your current implementation:

1. Events are inserted into `event_outbox` (`pending`) and then enqueued to BullMQ dispatch queue (`jobId = event.id`). (`/Users/alancohen/projects/scheduling-app/apps/api/src/services/jobs/emitter.ts`)
2. Dispatch worker claims outbox row (`pending -> processing`), fans out to integration queues via BullMQ `FlowProducer`, then marks outbox `delivered` on successful fanout enqueue. (`/Users/alancohen/projects/scheduling-app/apps/api/src/services/jobs/worker.ts`, `/Users/alancohen/projects/scheduling-app/apps/api/src/services/jobs/queue.ts`)
3. Retries are currently `attempts: 3` with exponential backoff `delay: 1000ms`; integration worker concurrency is `1` per queue. (`/Users/alancohen/projects/scheduling-app/apps/api/src/services/jobs/queue.ts`)
4. A stale outbox sweep runs every minute and re-enqueues up to 100 stale `pending` entries guarded by advisory lock. (`/Users/alancohen/projects/scheduling-app/apps/api/src/worker.ts`, `/Users/alancohen/projects/scheduling-app/apps/api/src/services/jobs/worker.ts`)
5. Bull Board is used for queue visibility. (`/Users/alancohen/projects/scheduling-app/apps/api/src/bull-board.ts`)

This gives a clean baseline for migration mapping.

---

## Technical Deep Dive

### 1. Queue Model

`pg-boss` queue storage is relational and partition-oriented:

1. It uses a logical `job` table partitioned by queue name (`LIST` partitioning), with optional dedicated per-queue physical partition tables for noisy queues.[2][10]
2. Queue creation supports policy-level behavior (`standard`, `short`, `singleton`, `stately`, `exclusive`, `key_strict_fifo`) and queue-level retry/retention/dead-letter options.[6][10]
3. A job lifecycle is explicit (`created`, `retry`, `active`, `completed`, `cancelled`, `failed`).[2]
4. Queue metadata and cached stats live in `pgboss.queue`, with periodic refresh/maintenance loops.[10][14]

**Inference:** this is operationally closer to “application-owned queue tables” than to Redis-native queue semantics. It improves SQL inspectability/debuggability, but shifts pressure and tuning responsibility to Postgres.

### 2. Pub/Sub APIs

`pg-boss` pub/sub is intentionally thin:

1. `subscribe(event, queueName)` upserts into `pgboss.subscription`.[5][10][11]
2. `publish(event, data, options)` looks up subscribed queues and calls `send()` to each.[5][11]
3. `unsubscribe(event, queueName)` deletes subscription mapping.[5][10][11]

Important implementation detail:

1. `publish()` executes per-queue sends via `Promise.allSettled(...)` and does not surface per-subscriber failures by default.[11]

**Inference:** publish is fanout dispatch, not a strong broker-level ACK protocol. If your integration fanout requires all-or-nothing guarantees, wrap `publish()` with explicit outcome validation and compensating logic.

### 3. Delivery Guarantees

Documented and implemented behaviors:

1. Docs/README emphasize exactly-once job delivery semantics based on `FOR UPDATE SKIP LOCKED` and transactional state transitions.[1][2][16]
2. Fetch path atomically selects and promotes jobs to `active` using `FOR UPDATE SKIP LOCKED`.[10]
3. Handler success auto-calls `complete`; handler throw auto-calls `fail` (which may move to retry/failed).[4][11]
4. Active job timeout is enforced by supervision (`failJobsByTimeout`) based on `expire_seconds`.[10][14]

Nuance for external effects:

1. If handler side effects execute and process crashes before `complete`, retries may replay side effects.
2. Shutdown path can eventually force active jobs to fail/retry (`failWip`) if workers don’t drain in time.[13]

**Inference:** queue row delivery is strongly coordinated, but provider/API side effects are effectively at-least-once unless you enforce idempotency keys in your integration layer.

### 4. Retries and Backoff

`pg-boss` retry behavior:

1. Defaults: `retryLimit=2`, `retryDelay=0`, `retryBackoff=false`.[3][6]
2. Backoff formula supports jitter and optional cap (`retryDelayMax`), implemented in SQL during failure transition.[3][6][10]
3. Retry transition is implemented by delete/reinsert state transition CTEs (`failJobs`), preserving key metadata and updating `start_after`.[10]

Mapping note for your current BullMQ config:

1. Current BullMQ uses `attempts: 3` with exponential backoff 1s.[20]
2. Equivalent in `pg-boss` is generally `retryLimit: 2`, `retryDelay: 1`, `retryBackoff: true`.

### 5. Dead Letters

`pg-boss` dead-letter behavior:

1. Queue can define `deadLetter` queue.[6]
2. On terminal failure, payload/output are copied into dead-letter queue using that queue’s retry/retention policy.[6][10]
3. Dead-letter target is referentially constrained to an existing queue.[10]

**Inference:** unlike BullMQ’s failed set model, `pg-boss` dead letters are first-class jobs in another queue, which is useful for replay pipelines but requires explicit DLQ worker/runbook decisions.

### 6. Scheduling

Built-in cron scheduler details:

1. Schedules are DB records (`pgboss.schedule`) with upsert semantics (`schedule` updates if existing key).[7][10][12]
2. A dedicated internal queue (`__pgboss__send-it`) dispatches due schedules.[12]
3. Multi-node dedupe is enforced with singleton throttling; cron monitor ownership is coordinated via timestamp update gating (`trySetCronTime`).[7][10][12]
4. Clock skew is monitored against DB time and offset applied in cron evaluation.[7][12]

### 7. Throughput and Scaling Characteristics

What the primary sources support:

1. Throughput scales by `localConcurrency`, `batchSize`, polling interval, and worker node count.[4]
2. Queue fetch query supports optional faster mode by disabling `orderByCreatedOn`.[3][10]
3. Optional per-queue partitioning reduces noisy-neighbor effects for hot queues.[2][6][10]
4. Group concurrency can enforce global per-tenant caps via DB-side active counts (with documented race-window caveat).[4][10]

What sources do **not** provide:

1. No official benchmark numbers (e.g., jobs/sec on standard hardware) in current primary docs.

**Inference:** expected throughput is highly workload-specific and should be validated in your environment (payload size, retry profile, batching, queue cardinality, and Postgres IOPS/CPU).

### 8. Operational Behavior

Key operational characteristics:

1. `start()` auto-installs/migrates schema by default and can delay startup during heavier migrations.[8][13]
2. Schema and maintenance operations are advisory-lock protected (`pg_advisory_xact_lock`) to avoid race conditions across replicas.[8][10][18]
3. Background supervision handles queue stats, timeout failures, and retention deletion loops.[14]
4. BAM (boss async migrations) tracks long-running post-migration DB commands with status APIs/events.[8][9][13]
5. Observability events include `error`, `warning`, `wip`, `stopped`, and `bam`.[9][13]

### 9. Multi-Tenant Patterns for This Product

Patterns directly supported by `pg-boss`:

1. **Tenant-aware fairness:** put `orgId` in `group.id` and use `groupConcurrency` to bound global per-tenant active jobs.[3][4][10]
2. **Tiered tenant QoS:** use `group.tier` + tiered `groupConcurrency` config.[4]
3. **Per-entity serialization:** use `key_strict_fifo` with `singletonKey` for strict in-order processing per entity key.[6][10]
4. **Hot queue isolation:** set `partition: true` for heavy queues to isolate plans/index behavior.[2][6][10]

Constraints to plan around:

1. `pgboss` internal schema is not org-scoped by default; tenant boundaries must come from payload, keying, worker logic, and auth boundaries around queue access.
2. Existing RLS model on your app tables does not automatically carry over to pgboss internal tables.

**Inference:** for this project, queue-level multi-tenancy should be enforced at handler and job metadata level, while keeping direct DB access to `pgboss` schema tightly restricted to trusted worker roles.

---

## BullMQ → pg-boss Migration Implications

### Feature Mapping

| Current BullMQ usage | pg-boss equivalent | Implication |
| --- | --- | --- |
| `Queue.add` dispatch jobs | `send(queue, data, options)` | Straight mapping; use `id=event.id` for deterministic IDs. |
| `attempts + backoff(exponential)` | `retryLimit + retryDelay + retryBackoff(+retryDelayMax)` | Map `attempts:3` to `retryLimit:2` semantics. |
| `FlowProducer` parent + children | `publish(event)` + subscribed queues | No built-in parent/child completion barrier; add custom fanout receipt tracking if needed. |
| BullMQ delayed/repeat jobs | `startAfter` + `schedule()` | Native support in `pg-boss`; cron monitor/worker behavior differs. |
| Failed set / manual requeue | `failed` state + `retry()` + optional dead-letter queue | DLQ is queue-native and more explicit. |
| Bull Board observability | `wip/warning/bam` events + queue stats + SQL dashboards | You’ll need custom UI/runbooks to replace Bull Board ergonomics. |
| Redis/Valkey infra | PostgreSQL-only queue infra | Simpler stack, but increased Postgres load and tuning responsibility. |

### Specific Migration Fit Against Current `scheduling-app` Code

1. **Dispatch/outbox stage:** can remain mostly intact; replace BullMQ dispatch queue with `pg-boss` dispatch queue.
2. **Fanout stage:** replace FlowProducer child fanout with `publish(eventType, eventPayload)` and integration queue subscriptions.
3. **Integration workers:** map per-integration workers to `work(queueName, ...)`; account for per-node `localConcurrency` semantics.[4]
4. **Stale sweep:** may still be useful initially if you keep fire-and-forget enqueue after outbox write; could be simplified later if publish/enqueue becomes transactionally coupled via shared DB adapter.[3]
5. **Retention profile:** must be explicitly tuned to avoid table bloat vs current aggressive BullMQ cleanup.

### Behavioral Deltas You Need to Accept or Replace

1. **No native flow-graph barrier equivalent** (current BullMQ parent fanout job is mostly audit/join barrier).
2. **Publish doesn’t fail fast by default** for per-subscriber failures (`allSettled`).
3. **Global “concurrency 1 per integration” is not automatic across nodes**; `localConcurrency` is per process, and global limits require group-based patterns.[4]
4. **Runtime support uncertainty on Bun** despite Node-targeted support matrix.[1][15]

---

## Risks and Mitigations

| Risk | Severity | Why it matters here | Mitigation |
| --- | --- | --- | --- |
| Bun runtime compatibility with `pg-boss` | High | Official engine target is Node >=22.12; project standard runtime is Bun.[1][15] | Run a Bun compatibility spike first (start, send, work, retry, schedule, graceful stop). If unstable, run `pg-boss` worker as a dedicated Node sidecar process. |
| Silent partial fanout failures from `publish()` | High | `publish()` uses `Promise.allSettled`; failures may be lost without wrapping.[11] | Add a project wrapper that inspects settled results, logs failed queues, and re-enqueues or marks outbox as retryable. |
| Duplicate external side effects on retry/crash | High | Queue semantics are robust, but external APIs are not exactly-once by default. | Enforce deterministic idempotency keys per event+integration and persist send receipts with unique constraints. |
| Loss of BullMQ flow parent-child semantics | Medium | Current code uses flow parent as join barrier/audit marker. | If barrier needed, add explicit `fanout_receipts` table keyed by event/integration and derive completion from counts. |
| Postgres load regression | High | Queue polling + retries + cron + retention cleanup move into primary DB. | Capacity-test with realistic event rates; tune polling/batch/ordering, partition hot queues, and set explicit retention policies. |
| Retention bloat vs current BullMQ cleanup | Medium | Current BullMQ keeps only recent completions/failures by count; pg-boss defaults are time-based days.[3][6] | Set queue-level `deleteAfterSeconds` and `retentionSeconds` intentionally per queue class. |
| Multi-tenant fairness drift in distributed workers | Medium | Current integration concurrency is intentionally low. | Use `group.id=orgId` and `groupConcurrency` with tier rules; monitor group overages and adjust worker topology. |
| Operational visibility gap after Bull Board removal | Medium | Team currently has dedicated queue UI endpoint. | Build SQL/event-based dashboards for queue depth, retry rates, DLQ growth, timeout failures, and scheduler skew warnings. |

---

## Practical Migration Shape (Recommended)

1. **Phase 0: Compatibility spike**
   - Validate `PgBoss.start/send/work/stop/schedule` under Bun in this repo environment.
2. **Phase 1: Abstraction hardening**
   - Keep existing `JobQueue` abstraction and add `PgBossJobQueue` implementation behind same interface.
3. **Phase 2: Mirror fanout**
   - Keep BullMQ as primary; mirror to `pg-boss publish` and compare per-event fanout parity by integration.
4. **Phase 3: Cutover workers**
   - Move one low-risk integration queue first; validate retries/DLQ/latency/DB load.
5. **Phase 4: Full cutover + cleanup**
   - Remove BullMQ/Valkey dependencies and Bull Board once parity and ops dashboards are stable.

---

## Source Links (Official / Primary)

### pg-boss official docs and source

1. `pg-boss` repository README (features, requirements, guarantees):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/README.md](https://github.com/timgit/pg-boss/blob/12.10.0/README.md)
2. Intro (queue model, SKIP LOCKED, partitioning guidance):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/introduction.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/introduction.md)
3. Jobs API (retry, retention, startAfter, groups, singleton/debounce):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/jobs.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/jobs.md)
4. Workers API (polling, local/global concurrency semantics):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/workers.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/workers.md)
5. Pub/sub API:  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/pubsub.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/pubsub.md)
6. Queues API (policies, deadLetter, partition, retries, strict FIFO):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/queues.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/queues.md)
7. Scheduling API:  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/scheduling.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/scheduling.md)
8. Operations API (start/stop/migrations/advisory-lock behavior):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/ops.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/ops.md)
9. Events API (`error`, `warning`, `wip`, `stopped`, `bam`):  
   [https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/events.md](https://github.com/timgit/pg-boss/blob/12.10.0/docs/api/events.md)
10. SQL/state transition implementation (fetch/retry/fail/DLQ/maintenance/locks):  
    [https://github.com/timgit/pg-boss/blob/12.10.0/src/plans.ts](https://github.com/timgit/pg-boss/blob/12.10.0/src/plans.ts)
11. Manager implementation (`publish`, `send`, worker/fetch behavior):  
    [https://github.com/timgit/pg-boss/blob/12.10.0/src/manager.ts](https://github.com/timgit/pg-boss/blob/12.10.0/src/manager.ts)
12. Scheduler implementation (`timekeeper`, clock skew):  
    [https://github.com/timgit/pg-boss/blob/12.10.0/src/timekeeper.ts](https://github.com/timgit/pg-boss/blob/12.10.0/src/timekeeper.ts)
13. Main lifecycle (`start`, `stop`, `failWip` path):  
    [https://github.com/timgit/pg-boss/blob/12.10.0/src/index.ts](https://github.com/timgit/pg-boss/blob/12.10.0/src/index.ts)
14. Supervision/monitor/maintenance internals:  
    [https://github.com/timgit/pg-boss/blob/12.10.0/src/boss.ts](https://github.com/timgit/pg-boss/blob/12.10.0/src/boss.ts)
15. Runtime engine declaration (Node requirement):  
    [https://github.com/timgit/pg-boss/blob/12.10.0/package.json](https://github.com/timgit/pg-boss/blob/12.10.0/package.json)

### PostgreSQL primary docs

16. `FOR UPDATE SKIP LOCKED`:  
    [https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
17. Declarative partitioning best practices:  
    [https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-BEST-PRACTICES](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-BEST-PRACTICES)
18. Advisory lock functions:  
    [https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)

### BullMQ official docs (for migration comparison)

19. Important notes (`at least once` semantics, stalled jobs):  
    [https://docs.bullmq.io/bull/important-notes](https://docs.bullmq.io/bull/important-notes)
20. Retrying failing jobs (attempts, backoff):  
    [https://docs.bullmq.io/guide/retrying-failing-jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
21. Flows (parent/child dependency model):  
    [https://docs.bullmq.io/guide/flows](https://docs.bullmq.io/guide/flows)
22. Delayed jobs:  
    [https://docs.bullmq.io/guide/jobs/delayed](https://docs.bullmq.io/guide/jobs/delayed)

---

## Notes on Inference vs Explicit Docs

1. Statements marked as **Inference** are reasoned from implementation/docs rather than directly stated as product guarantees.
2. No official pg-boss throughput benchmark numbers were found in official docs/source during this research pass.
