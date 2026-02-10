# Performance Considerations: Replacing BullMQ/Valkey with pg-boss + Workflow DevKit

Date: 2026-02-10  
Status: Research report for migration planning  
Scope: `@scheduling/api`, `@scheduling/db`, workflow runtime adoption

## Executive Summary

Moving from BullMQ/Valkey to pg-boss + Workflow DevKit (Postgres World) is feasible, but the performance profile shifts from Redis-blocking queue semantics to Postgres polling semantics.

Key conclusions:

1. **Latency floor changes materially with polling.** pg-boss defaults to `pollingIntervalSeconds=2` (too high for step-chaining); Workflow Postgres World already overrides to `0.5s` and documents this is still a bottleneck.
2. **Postgres becomes the primary bottleneck.** Queue fetch, state transitions, retries, and workflow storage all hit the same database, so lock contention, autovacuum pressure, and connection limits become first-order constraints.
3. **Current repo defaults are under-provisioned for this shift.** API DB pool is currently `max=5`, while Workflow Postgres World + pg-boss defaults can add up to ~20 DB connections per worker process before scaling replicas.
4. **Queue/table isolation matters early.** pg-boss supports queue partitioning and policies; for multi-tenant noisy-neighbor control, partitioning should be used for high-volume queues.
5. **Cutover should be gated by explicit perf thresholds and soak tests, not feature parity alone.** This report defines a benchmark matrix and recommended SLO/SLA thresholds.

## Current Baseline in This Repo

### Observed runtime settings

| Area | Current setting | Location |
|---|---|---|
| Dispatch worker concurrency | `10` | `apps/api/src/services/jobs/queue.ts` |
| Fanout worker concurrency | `10` | `apps/api/src/services/jobs/queue.ts` |
| Integration worker concurrency | `1` per integration queue | `apps/api/src/services/jobs/queue.ts` |
| Default queue retries | `attempts: 3`, exponential backoff `delay: 1000` | `apps/api/src/services/jobs/queue.ts` |
| Stale outbox sweep cadence | every `60_000 ms` | `apps/api/src/worker.ts` |
| Stale sweep lock | advisory transaction lock | `apps/api/src/services/jobs/worker.ts` |
| API SQL pool | `max=5`, `idleTimeout=30s`, `connectionTimeout=30s` | `apps/api/src/lib/db.ts` |
| `event_outbox` indexes | no dedicated index on `status` / `next_attempt_at` in init migration | `packages/db/src/migrations/20260208064434_init/migration.sql` |

### Baseline implications

1. Current queue path offloads dispatch pressure to Valkey; Postgres currently handles outbox state + business tables.
2. Stale sweep is serial by org and can become a background bottleneck as org count grows.
3. `event_outbox` pending-retry scans are likely to degrade with growth without targeted indexes.

## Primary Behavior Differences (BullMQ vs pg-boss + Workflow DevKit)

| Dimension | BullMQ/Valkey | pg-boss + Workflow DevKit Postgres World | Perf impact |
|---|---|---|---|
| Dequeue trigger | Redis blocking pop (`bzpopmin`) style behavior | Polling loop over Postgres (`FOR UPDATE SKIP LOCKED`) | Poll interval adds pickup jitter and background query load |
| Delivery semantics | At-least-once; stalled lock renewal can double-process | Claims exactly-once delivery in queue table semantics; still require external idempotency for side effects | Different failure modes; idempotency still required |
| Queue storage | Valkey memory/disk | Postgres tables + indexes + vacuum | Higher shared DB load and vacuum sensitivity |
| Worker wake-up | Blocking/unblock behavior | Poll interval or explicit `notifyWorker` | Idle polling overhead unless actively notified |
| Multi-tenant isolation | Redis-level queue separation | Queue policies + optional physical partitioning | Partition strategy needed for noisy-neighbor control |

## Latency Considerations

### Polling floor and queue pickup latency

- pg-boss worker default poll interval: **2s**.
- pg-boss minimum accepted poll interval: **0.5s**.
- Workflow Postgres World hardcodes poll interval to **0.5s** and comments that even this is still too slow for fast step succession.

Practical effect:

- With 2.0s polling, expected queue pickup jitter is roughly 0–2000ms (median near ~1000ms).
- With 0.5s polling, expected pickup jitter is roughly 0–500ms (median near ~250ms).

These are **before** DB query time, lock contention, and handler time.

### Current upstream Workflow Postgres benchmark signal (2026-02-10)

From Workflow DevKit CI benchmark feed:

| Test | `world=postgres` workflowTime |
|---|---:|
| workflow with no steps | 322 ms |
| workflow with 1 step | 2426.5 ms |
| workflow with 10 sequential steps | 20286 ms |
| workflow with 25 sequential steps | 50316 ms |
| workflow with 50 sequential steps | 100224 ms |
| workflow with stream | workflowTime 2331.7 ms, TTFB 2710.4 ms |

Interpretation: step-heavy sequential flows are roughly linear in elapsed time and sensitive to queue wake behavior. This aligns with the world-postgres polling note.

## Throughput and Bottlenecks

### 1) DB-bound fetch/claim path

pg-boss fetch path uses `FOR UPDATE SKIP LOCKED`, plus queue/state/index logic. Throughput scales until one of these saturates:

1. CPU on Postgres backend workers.
2. Shared buffer + disk I/O from frequent state transitions.
3. Lock manager pressure when many consumers target same queue/table slice.

### 2) Queue contention and noisy-neighbor risk

- Hot queues can dominate shared job tables.
- pg-boss supports queue `partition: true` to isolate large/noisy queues physically.
- Group/singleton policies improve correctness but can reduce effective parallelism.

### 3) Order guarantees vs raw throughput

- pg-boss fetch supports `orderByCreatedOn` (default true).
- Disabling strict created-on ordering can increase fetch throughput for workloads where ordering is not required.

### 4) Retry and state churn cost

High retry rates increase:

1. UPDATE frequency on queue rows.
2. WAL volume.
3. Dead tuples and vacuum work.

This is materially different from Valkey-backed queues where retry churn is not competing with core relational workload.

### 5) Existing outbox sweep pressure

Current stale sweep:

1. Runs every minute.
2. Scans orgs serially.
3. Performs pending + `next_attempt_at` lookups.

Under pg-boss migration, this path should be minimized or redesigned so queue-native retry/recovery does more work.

## DB Load, Polling Behavior, and Connection Pools

### Polling overhead model

Approximate idle fetch query rate:

```text
idle_poll_qps ~= total_workers / polling_interval_seconds
```

For Workflow Postgres World defaults:

- `queueConcurrency=10`
- 2 queue types (`workflow`, `step`)
- total workers ~= 20
- polling interval `0.5s`

Then idle fetch rate is roughly:

```text
20 / 0.5 = 40 fetch cycles per second
```

before handling any real jobs.

### Connection pool pressure

Defaults from upstream components:

- pg-boss internal pool default max: **10**
- `postgres` client default max: **10**
- current API Bun SQL pool in repo: **5**

So one worker process using Workflow Postgres World can allocate around **20 DB connections** just from pg-boss + postgres.js clients (not counting API process pools or admin connections).

### Recommended connection budgeting formula

```text
total_connections =
  api_replicas * (api_sql_pool + api_pg_boss_pool_if_any)
+ worker_replicas * (worker_pg_boss_pool + worker_postgres_pool)
+ operational_headroom
```

Recommended rule:

- Keep steady-state below **70% of `max_connections`**.
- Keep failover/incident headroom >= **20%**.
- Avoid solving saturation by only raising `max_connections`; Postgres docs note higher resource allocation with larger values.

## Horizontal Scaling Model

### What scales well

- More worker replicas can increase dequeue parallelism due to `SKIP LOCKED`.
- Partitioned high-volume queues reduce cross-tenant contention.

### What does not scale linearly

1. Single hot queue with strict ordering/policy constraints.
2. DB-heavy handlers that do large transactions.
3. High retry storms (each retry is additional DB write/read churn).

### Recommended scaling order

1. Tune queue schema/indexes and poll interval first.
2. Increase per-process concurrency only while DB CPU/lock waits are healthy.
3. Then scale worker replicas horizontally.
4. Revisit partition strategy when one queue exceeds 30-40% of job volume.

## Benchmarking Plan

### Objectives

1. Quantify latency and throughput deltas vs BullMQ baseline.
2. Identify first saturation point (CPU, locks, I/O, connections, vacuum).
3. Establish safe operating thresholds for cutover.

### Test environment requirements

1. Same Postgres major version/config as staging target.
2. Dedicated DB for benchmark (no mixed test traffic).
3. Realistic org cardinality (at least 100 orgs for multi-tenant tests).
4. Representative payload sizes (1KB, 8KB, 32KB).

### Concrete benchmark matrix

| ID | Scenario | Engine/config | Target ingress | Duration | Key assertions (pass thresholds) |
|---|---|---|---:|---|---|
| B1 | Baseline current dispatch/fanout | BullMQ current settings | 50 events/s | 30m | Capture baseline p95 end-to-end latency and throughput |
| B2 | pg-boss defaults only | pg-boss poll=2.0s, default pools | 50 events/s | 30m | Queue pickup p95 <= 2200ms, no backlog growth |
| B3 | Tuned poll | pg-boss poll=0.5s | 50 events/s | 30m | Queue pickup p95 <= 900ms, p99 <= 1800ms |
| B4 | Throughput ramp | pg-boss poll=0.5s | 25/50/100/150/200 events/s | 20m each | Find knee point where backlog trend turns positive |
| B5 | Multi-tenant contention | 80/20 hot-tenant skew | 100 events/s total | 45m | Hot tenant p95 <= 2x cold-tenant p95 |
| B6 | Queue partition isolation | High-volume queue `partition=true` vs shared | 100 events/s | 45m | Partitioned mode reduces lock waits by >= 25% |
| B7 | Retry storm | Inject 5% and 20% downstream failures | 100 events/s | 45m | System recovers; backlog drains to zero within 15m after fault stop |
| B8 | Horizontal scale | 1/2/4 worker replicas | 100-250 events/s | 30m each | Throughput scales >= 70% efficiency per doubling until DB cap |
| B9 | Connection saturation | Increment pool sizes + replicas | N/A | 30m | Active connections < 70% max; no connection timeout spikes |
| B10 | 24h soak | Final candidate config | steady 60-80% of peak | 24h | No monotonic backlog growth, no vacuum debt buildup |

### Metrics to collect per test

1. Queue pickup latency (`job_created` -> `handler_start`) p50/p95/p99.
2. End-to-end event latency (`event_outbox.created_at` -> final integration completion).
3. Workflow step wake latency for delayed/step-chained flows.
4. Throughput (jobs completed/sec) and backlog depth over time.
5. Retry rate, fail rate, DLQ counts, duplicate-prevented count.
6. DB CPU, read/write IOPS, WAL MB/s, checkpoint frequency.
7. `pg_stat_activity` connection count and wait events.
8. Lock wait p95 on job/outbox tables.
9. Dead tuple ratio and autovacuum cadence for hot tables.

## Recommended SLO/SLA Metrics and Thresholds

### Candidate SLOs (internal)

| SLO | Target |
|---|---|
| Event enqueue success | >= 99.99% monthly |
| Dispatch completion (non-failing downstream) | >= 99.9% monthly |
| Queue pickup latency p95 (normal load) | <= 900ms |
| Queue pickup latency p99 (normal load) | <= 1800ms |
| End-to-end event processing p95 | <= 2500ms |
| End-to-end event processing p99 | <= 6000ms |
| Workflow step wake latency p95 | <= 1500ms |
| Workflow step wake latency p99 | <= 3000ms |
| Duplicate external side effects after idempotency | 0 (hard requirement) |

### Recommended operational alert thresholds

| Metric | Warn | Page/Critical |
|---|---:|---:|
| DB CPU (5-min avg) | > 70% | > 85% |
| Active DB connections / max | > 60% | > 75% |
| Queue pickup latency p95 | > 1200ms | > 2000ms |
| Backlog drain ETA | > 10m | > 20m |
| Retry rate (15-min) | > 3% | > 8% |
| Lock wait p95 on queue tables | > 25ms | > 75ms |
| Dead tuple ratio hot tables | > 15% | > 25% |

### Cutover gates (must pass)

1. B3, B4, B7, B8, and B10 all pass thresholds.
2. 24h soak shows stable queue depth and stable vacuum behavior.
3. No duplicate side effects under induced retries/failovers.
4. Connection and CPU limits remain under critical thresholds with 20% headroom.

## Cost/Performance Tradeoffs

| Option | Pros | Cons |
|---|---|---|
| Keep BullMQ + Valkey | Lowest queue latency jitter; isolates queue load from Postgres | Extra infra/service to run; separate observability surface |
| Move to pg-boss default config | Simpler stack; one datastore | Higher latency with default polling (2s); easy to under-tune |
| Move to tuned pg-boss + Workflow Postgres | Unified Postgres-centric architecture; enables durable workflow patterns | Higher Postgres compute/I/O cost; needs strict capacity/connection management |

### Practical cost guidance

1. Removing Valkey saves direct infra cost, but Postgres instance class may need to increase.
2. Polling at 0.5s materially increases background query volume even at idle.
3. Storage retention defaults (job retention/delete windows) should be tuned to avoid unnecessary table growth.

## Repo-Specific Bottlenecks to Address Before Fair Benchmarking

1. Add targeted `event_outbox` indexes in the **initial migration file** (project policy: no new migrations during active dev).
2. Re-evaluate stale sweep design (currently minute-based serial org scan) so it does not become hidden DB tax.
3. Define explicit connection budgets for API and worker processes before horizontal scale tests.
4. Validate version strategy: `@workflow/world-postgres` currently depends on `pg-boss 11.0.7` while npm latest pg-boss is `12.10.0` (as of 2026-02-10). Benchmark exact version set intended for production.

## Recommended Starting Configuration for Staging Benchmarks

These are starting points for B3/B4/B10, not final production values:

1. `pollingIntervalSeconds=0.5` for workflow queues.
2. `queueConcurrency=8` initially (increase only if DB remains below thresholds).
3. pg-boss pool max: 6-8 per worker process.
4. postgres.js pool max: 6-8 per worker process.
5. Keep total active connections below 70% of DB `max_connections` at peak test load.
6. Use partitioned queues for highest-volume domains.

## Primary Sources (Current Docs and Upstream Source)

### This repository

- `apps/api/src/services/jobs/queue.ts`
- `apps/api/src/services/jobs/worker.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/lib/db.ts`
- `packages/db/src/migrations/20260208064434_init/migration.sql`
- `docs/event-bus-workflow-runtime-rfc.md`

### pg-boss (official docs + source)

- [pg-boss README](https://raw.githubusercontent.com/timgit/pg-boss/master/README.md)
- [pg-boss workers API](https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/workers.md)
- [pg-boss constructor API](https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/constructor.md)
- [pg-boss jobs API](https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/jobs.md)
- [pg-boss queues API](https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/queues.md)
- [pg-boss `attorney.ts` (polling bounds)](https://raw.githubusercontent.com/timgit/pg-boss/master/src/attorney.ts)
- [pg-boss `plans.ts` (`SKIP LOCKED` fetch/indexes)](https://raw.githubusercontent.com/timgit/pg-boss/master/src/plans.ts)
- [pg-boss `worker.ts` (polling loop)](https://raw.githubusercontent.com/timgit/pg-boss/master/src/worker.ts)
- [pg-boss `manager.ts` (send/fetch paths)](https://raw.githubusercontent.com/timgit/pg-boss/master/src/manager.ts)

### Workflow DevKit Postgres World (official docs + source)

- [Postgres World docs page](https://raw.githubusercontent.com/vercel/workflow/main/docs/content/docs/deploying/world/postgres-world.mdx)
- [world-postgres README](https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/README.md)
- [world-postgres `src/index.ts`](https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/src/index.ts)
- [world-postgres `src/queue.ts`](https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/src/queue.ts)
- [Workflow benchmark feed](https://vercel.github.io/workflow/ci/benchmark-results.json)
- [Workflow e2e feed](https://vercel.github.io/workflow/ci/e2e-results.json)

### BullMQ (official docs + source)

- [BullMQ important notes (at-least-once / stalled)](https://docs.bullmq.io/bull/important-notes)
- [BullMQ parallelism/concurrency guide](https://docs.bullmq.io/guide/parallelism-and-concurrency)
- [BullMQ worker concurrency guide](https://docs.bullmq.io/guide/workers/concurrency)
- [BullMQ worker options source](https://raw.githubusercontent.com/taskforcesh/bullmq/master/src/interfaces/worker-options.ts)
- [BullMQ worker source](https://raw.githubusercontent.com/taskforcesh/bullmq/master/src/classes/worker.ts)

### PostgreSQL official docs

- [SELECT / `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)
- [NOTIFY/LISTEN behavior](https://www.postgresql.org/docs/current/sql-notify.html)
- [Connection config (`max_connections`)](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Routine vacuuming/autovacuum](https://www.postgresql.org/docs/current/routine-vacuuming.html)

### Version references (as of 2026-02-10)

- [npm: pg-boss](https://www.npmjs.com/package/pg-boss)
- [npm: bullmq](https://www.npmjs.com/package/bullmq)
- [npm: @workflow/world-postgres](https://www.npmjs.com/package/@workflow/world-postgres)
- [postgres.js README (pool defaults)](https://raw.githubusercontent.com/porsager/postgres/master/README.md)

