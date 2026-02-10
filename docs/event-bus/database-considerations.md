# Database Considerations: pg-boss + Workflow DevKit on PostgreSQL

Date: 2026-02-10  
Repo Context: `/Users/alancohen/projects/scheduling-app`  
Scope: DB design and operations for migrating queue/workflow runtime to Postgres-backed stack

## Executive Summary

Moving queue and workflow execution onto Postgres (pg-boss + WDK Postgres World) can simplify architecture, but it concentrates reliability and performance risk in one datastore. Success depends on disciplined data lifecycle controls, indexing strategy, vacuum tuning, and connection management.

High-level recommendation:

1. Treat queue/workflow tables as high-churn operational data.
2. Enforce strict retention and archival policies from day one.
3. Separate app business data and queue/workflow data concerns via schemas, roles, and observability.
4. Validate capacity with staged load tests before cutover.

## 1) Workload Shape You Should Expect

Inference based on current architecture and proposed migration:

1. High write rate for enqueued jobs/events.
2. High update rate for attempts, status transitions, retries.
3. Frequent polling/read patterns from workers.
4. Time-based scans for delayed/scheduled jobs.

In Postgres terms, this is classic queue-table churn:

1. Many short-lived rows.
2. Frequent dead tuple creation.
3. Potential bloat and vacuum pressure if retention is weak.

## 2) Queue Mechanics and Locking

pg-boss is documented as using `SKIP LOCKED` patterns (via PostgreSQL row locking primitives).  
This is effective for concurrent worker claims, but there are DB-side implications:

1. Proper indexes are mandatory on fetch predicates.
2. Worker batch sizes and polling cadence materially affect contention.
3. Long transactions around claimed jobs can hold row locks longer than intended.

Recommendation:

1. Keep worker transactions small.
2. Avoid mixing long business transactions with queue claim/ack operations.
3. Monitor lock waits and blocked sessions during load tests.

## 3) Schema Isolation and Multi-Tenancy

You already use RLS for business tables. For queue/workflow internals:

1. Prefer dedicated schema for queue/runtime internals.
2. Keep queue internals out of tenant-facing query paths.
3. Enforce app-level tenant scoping in payload metadata and logs even if runtime tables are infra-level.

Rationale:

1. RLS on hot queue internals can add overhead and complexity.
2. It is often safer to isolate infra tables by role boundary and expose tenant-safe projections for UI/ops.

## 4) Indexing Strategy

For queue/workflow high-churn tables, prioritize:

1. Status + schedule-time indexes for ready-to-run selection.
2. Retry/dead-letter lookup indexes for operations UI and runbooks.
3. Uniqueness constraints for idempotency keys (`delivery_key`, trigger dedupe keys).

For your future workflow tables (`workflow_runs`, `workflow_delivery_log`):

1. Composite indexes around `(org_id, status, created_at desc)`.
2. Targeted indexes for `(workflow_definition_id, status)` and `(trigger_event_id)`.
3. Unique index for deterministic run key and for delivery idempotency key.

Rule: design indexes around actual worker/query predicates, not generic columns.

## 5) Autovacuum, Bloat, and Retention

Queue workloads create dead tuples quickly. PostgreSQL docs emphasize autovacuum tuning and routine vacuuming for high-update tables.

Baseline controls:

1. Per-table autovacuum overrides for queue-heavy tables.
2. Aggressive retention purge for completed/expired jobs and old run logs.
3. Regular bloat checks and vacuum/analyze validation in ops dashboards.

Retention policy guidance:

1. Keep only recent operational rows in hot tables.
2. Move audit-grade historical events to cold/archive tables or object storage.
3. Ensure purge jobs are incremental to avoid spike deletes.

## 6) Partitioning for Operational Tables

PostgreSQL partitioning docs highlight strong benefits for large append/churn tables:

1. Fast lifecycle management by dropping/detaching partitions.
2. Better maintenance isolation per partition.

For long-term growth, partitioning by time can be useful for:

1. workflow run logs
2. delivery attempt logs
3. event/outbox archives

Caveat: do not partition prematurely for small volumes; add when retention windows and volume justify operational complexity.

## 7) Transaction Isolation and Exactly-Once Expectations

No mainstream queue runtime can guarantee mathematical exactly-once side effects with external systems.

DB-side strategy should be:

1. At-least-once processing with idempotent side effects.
2. Unique constraints to enforce dedupe at DB boundary.
3. Deterministic keys for trigger and delivery operations.

For this repo:

1. Keep outbox/event publication idempotent.
2. Add deterministic workflow run dedupe key.
3. Add deterministic delivery key with unique constraint.

## 8) Connection and Pool Management

Postgres `max_connections` is finite and expensive at scale. Queue workers can easily consume large connection counts if not controlled.

Recommendations:

1. Size worker concurrency with explicit connection budget.
2. Use pooling strategy appropriate for worker patterns.
3. Keep separate logical pools for API traffic and background workers where possible.
4. Load test with realistic concurrency and failure scenarios.

If pooling via PgBouncer is introduced:

1. Validate transaction semantics for libraries in use.
2. Ensure any session-level assumptions are avoided in worker code.

## 9) HA, Replication, and Recovery

Given the queue/runtime dependency on Postgres:

1. Postgres availability becomes queue availability.
2. WAL/replication configuration and failover posture directly affect async processing continuity.
3. PITR strategy must include queue/workflow tables and operational run metadata.

Practical controls:

1. Test failover behavior for worker reconnect + idempotent resume.
2. Validate that recovery replay does not cause duplicate side effects (dedupe keys must hold).
3. Document runbooks for partial replay and reconciliation.

## 10) Migration Sequencing Checklist (DB-Centric)

### Phase A: Prep

1. Baseline DB metrics for current system (CPU, IOPS, lock waits, vacuum lag, bloat).
2. Define SLO thresholds for queue latency and workflow wake latency.
3. Reserve schema/role boundaries for new runtime tables.

### Phase B: Mirror

1. Start dual-write/mirror publication to new runtime.
2. Verify index effectiveness and query plans.
3. Confirm no significant regression in primary OLTP workload.

### Phase C: Shadow Consume

1. Run shadow workers without side effects.
2. Compare parity and lag against incumbent system.
3. Stress test retry storms and delayed-job spikes.

### Phase D: Cutover

1. Shift primary consumers to new stack.
2. Keep rollback switch and replay strategy ready.
3. Watch lock contention, autovacuum backlog, queue depth, and retry rates.

### Phase E: Stabilize

1. Enforce retention jobs.
2. Tune per-table vacuum parameters.
3. Validate backup/restore drills including queue/workflow data.

## 11) Recommended DB Observability Pack

Minimum dashboards/alerts:

1. Queue table row growth and churn rate.
2. Queue lag and oldest-ready-job age.
3. Dead letter count and retry histogram.
4. Lock wait events and blocked worker sessions.
5. Autovacuum frequency and lag for queue/workflow tables.
6. Table/index bloat trend for high-churn tables.
7. Connection saturation and pool wait time.

## 12) Risks and Mitigations

1. **Risk:** Queue churn causes bloat and vacuum lag.
   - Mitigation: retention pruning, per-table autovacuum tuning, optional partitioning.
2. **Risk:** API traffic and workers contend for same DB resources.
   - Mitigation: separate pool budgets and concurrency caps.
3. **Risk:** Failover/replay causes duplicate side effects.
   - Mitigation: deterministic idempotency keys + DB unique constraints + reconciliation jobs.
4. **Risk:** Tenant safety leakage in operational UIs.
   - Mitigation: tenant-safe projections and authz filtering above infra tables.

## 13) Implementation Guidance for This Repo

Given current stack and patterns:

1. Keep business RLS model as-is for domain data.
2. Introduce workflow/queue operational tables with strict access boundaries.
3. Add domain-level dedupe logs for side effects.
4. Add retention/cleanup jobs before volume ramps.
5. Define explicit cutover SLO gates (latency, error, duplication rate).

## Sources

### pg-boss and runtime

1. pg-boss docs home/API nav: [https://timgit.github.io/pg-boss/](https://timgit.github.io/pg-boss/)
2. pg-boss package/readme summary: [https://www.npmjs.com/package/pg-boss](https://www.npmjs.com/package/pg-boss)
3. WDK Postgres World: [https://useworkflow.dev/worlds/postgres](https://useworkflow.dev/worlds/postgres)
4. WDK Worlds overview: [https://useworkflow.dev/worlds](https://useworkflow.dev/worlds)

### PostgreSQL core docs

1. `SELECT ... FOR UPDATE ... SKIP LOCKED`: [https://www.postgresql.org/docs/current/sql-select.html](https://www.postgresql.org/docs/current/sql-select.html)
2. Vacuuming config: [https://www.postgresql.org/docs/current/runtime-config-vacuum.html](https://www.postgresql.org/docs/current/runtime-config-vacuum.html)
3. Routine vacuuming: [https://www.postgresql.org/docs/15/routine-vacuuming.html](https://www.postgresql.org/docs/15/routine-vacuuming.html)
4. Table partitioning: [https://www.postgresql.org/docs/current/ddl-partitioning.html](https://www.postgresql.org/docs/current/ddl-partitioning.html)
5. Row-level security: [https://www.postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
6. Connections and `max_connections`: [https://www.postgresql.org/docs/current/runtime-config-connection.html](https://www.postgresql.org/docs/current/runtime-config-connection.html)
7. Replication settings: [https://www.postgresql.org/docs/current/runtime-config-replication.html](https://www.postgresql.org/docs/current/runtime-config-replication.html)
8. PITR and continuous archiving: [https://www.postgresql.org/docs/current/continuous-archiving.html](https://www.postgresql.org/docs/current/continuous-archiving.html)
