# Cmd+K Global Command Center RFC (Decision Pending)

Status: Draft RFC (no final architecture decision)  
Last Updated: 2026-02-08  
Owners: Product, `@scheduling/admin-ui`, `@scheduling/api`, `@scheduling/db`  
Related: `PRD.md`, `AGENTS.md`, `apps/admin-ui/src/components/command-palette.tsx`

## 1. Abstract

This RFC defines the decision framework and implementation plan for a command-first global search and action surface (`Cmd/Ctrl+K`) optimized for scheduling speed workflows.

This document is intentionally not finalizing the backend engine yet. It defines:

1. What must be true for the feature to be successful.
2. Which architecture options are viable.
3. How we will benchmark and decide.
4. How we will roll out and operate the system safely.

## 2. Why This RFC Exists

The current command palette is navigation-heavy and static. Our highest-frequency workflows are:

1. Create appointment.
2. Open appointment.
3. Open client and act.

We need a command center that prioritizes speed, relevance, and keyboard throughput while preserving existing URL-driven modal patterns in the admin app.

## 3. Current System Findings (Sub-agent Deep Dive)

### 3.1 Frontend and interaction constraints

1. A global `CommandPalette` already exists and is mounted in root layout (`apps/admin-ui/src/components/command-palette.tsx`, `apps/admin-ui/src/routes/__root.tsx`).
2. Shortcuts are centralized through `useKeyboardShortcuts` with global listener registration (`apps/admin-ui/src/hooks/use-keyboard-shortcuts.ts`).
3. Existing appointments and clients detail experiences are URL-driven with local close-snapshot anti-flicker patterns (`useUrlDrivenModal`, `useClosingSnapshot`).
4. Search param composition is already critical and regression-prone because some flows use `search: {}` while others merge with `search: (prev) => ({ ...prev })`.

### 3.2 Backend/data constraints

1. Multi-tenant isolation is enforced with Postgres RLS and `setOrgContext`.
2. Current client search is `ILIKE` only in `clients` repository; appointments have no text search path.
3. No global search endpoint exists today.
4. No dedicated search projection table exists today.
5. Repo constraint: no new incremental DB migrations right now; schema changes are applied by updating initial migration and dev reset (`AGENTS.md`).

### 3.3 Existing infra that helps

1. Event outbox and job worker infrastructure already exists and can support async indexing/sync models.
2. Strong route + query architecture (TanStack Router + Query) can support debounced global search cleanly.

## 4. Scope

### 4.1 In scope for initial release

1. Global invocation from any authenticated route.
2. Mixed results across:
   - actions
   - appointments
   - clients
   - navigation targets
3. Route-first execution contracts:
   - Client: `/clients?selected=<id>&tab=details`
   - Appointment: `/appointments?selected=<id>&tab=details`
   - Create: `/appointments?compose=1`
4. Prefilled create from selected client:
   - `/appointments?compose=1&clientId=<id>`
5. Feature flag rollout and rollback path.

### 4.2 Out of scope for initial release

1. Full natural-language scheduling assistant.
2. Cross-org search.
3. Replacing existing page CRUD workflows.
4. Mandatory destructive actions directly from command center.

## 5. Product and UX Requirements

1. Open with `Cmd/Ctrl+K`, close with `Esc`.
2. Zero-mouse completion for core flow.
3. Lanes must support:
   - `Act`
   - `Open`
   - `Go`
4. Empty query shows high-value actions and recents.
5. Non-empty query shows ranked mixed results with stable keyboard navigation.
6. Result execution must preserve current modal anti-flicker behavior.

## 6. Technical Requirements

1. Strict org isolation.
2. Deterministic ordering for same query + same data snapshot.
3. Observability on latency, errors, freshness, zero-result rate, click-through by rank.
4. Search freshness target for write-to-visible behavior must be explicitly measured and enforced.
5. Engine choice must be swappable behind an internal provider boundary.

## 7. Candidate Architecture Options (Decision Pending)

## 7.1 Option A: Postgres FTS + `pg_trgm` (no BM25 extension)

Model:

1. Use built-in full-text search (`tsvector` + `ts_rank_cd`) for lexical ranking.
2. Use `pg_trgm` for typo/prefix rescue and similarity ranking.
3. Keep data in Postgres only, with optional projection table.

Pros:

1. Lowest operational complexity.
2. Strong consistency model.
3. No separate service.

Cons:

1. Relevance quality may plateau compared with BM25/dedicated engines.
2. More manual tuning for ranking quality.

## 7.2 Option B: PG18 BM25 extension path + `pg_trgm`

Model:

1. Use BM25-capable extension path in PG18 for primary lexical relevance.
2. Keep trigram rescue for typo/prefix behavior.
3. Stay in single-store architecture.

Pros:

1. Better lexical ranking potential than pure `ts_rank_cd`.
2. No external search cluster.
3. Keeps relational filters and org isolation in same query surface.

Cons:

1. Extension lifecycle/maturity risk must be actively managed.
2. Tuning and extension operations are team-owned.

## 7.3 Option C: Neon `pg_search` path (environment-dependent)

Model:

1. Use Neon-managed `pg_search` capability when environment supports it.

Pros:

1. Strong in-DB search ergonomics.
2. Lower app-side complexity in compatible Neon environments.

Cons:

1. Environment compatibility constraints may conflict with local PG18-first baseline.
2. Provider coupling risk.

## 7.4 Option D: Meilisearch external service

Model:

1. Keep Postgres as source of truth.
2. Sync index asynchronously to Meilisearch via outbox worker.

Pros:

1. Very strong instant-search product ergonomics.
2. Fast read/query experience.

Cons:

1. Async task queue indexing means eventual consistency.
2. New operational surface and sync drift handling required.

## 7.5 Option E: Typesense external service

Model:

1. Sync index from outbox.
2. Serve command center queries from Typesense.

Pros:

1. Strong typo-tolerant search UX.
2. Synchronous write semantics are attractive for freshness.
3. Clear HA model (Raft) for clustered deploys.

Cons:

1. Memory-heavy architecture and sizing burden.
2. Separate distributed system to run.

## 7.6 Option F: Elasticsearch/OpenSearch external service

Model:

1. Full external search cluster with rich query DSL and aggregations.

Pros:

1. Highest feature and scale ceiling.
2. Mature ecosystem for advanced search use cases.

Cons:

1. Highest complexity and operational cost.
2. Near-real-time refresh behavior introduces consistency windows.

## 8. Option Comparison Matrix

| Option | Capability Fit | Performance Ceiling | Build/Ops Complexity | Freshness/Consistency | Vendor/Portability Risk |
|---|---|---|---|---|---|
| A. PG FTS + trgm | Good | High for current expected scale | Low | Strong | Low |
| B. PG18 BM25 path + trgm | Very good | High | Medium | Strong | Low-Medium |
| C. Neon pg_search | Very good | High | Low-Medium (if Neon-compatible) | Strong (verify) | Medium |
| D. Meilisearch | Very good | High | Medium-High | Eventual (async tasks) | Medium-High |
| E. Typesense | Very good | High | Medium-High | Stronger read-after-write profile | Medium |
| F. Elastic/OpenSearch | Excellent | Very high | High | Near-real-time refresh semantics | Medium |

## 9. Proposed Decision Framework

No final architecture selection is made in this RFC revision.

### 9.1 Weighted rubric

| Criterion | Weight |
|---|---:|
| User impact and UX speed | 30% |
| Reliability and SLO fit | 20% |
| Engineering complexity | 15% |
| Time to value | 15% |
| Operational burden | 10% |
| Cost profile | 10% |

### 9.2 Decision gates

1. Gate 1: Feasibility and compatibility checks complete.
2. Gate 2: Benchmark evidence and relevance scoring reviewed.
3. Gate 3: Rollout readiness signed off by owners.

## 10. Benchmark and Experiment Plan

### 10.1 Hypotheses

1. Chosen option can meet command-center latency targets at expected load.
2. Chosen option improves completion speed vs current static palette.
3. Chosen option does not create unacceptable operational burden.

### 10.2 Success metrics and thresholds

| Metric | Target | Fail Condition |
|---|---:|---:|
| API search latency p95 | <= 150 ms | > 200 ms |
| API search latency p99 | <= 300 ms | > 450 ms |
| Keystroke-to-render p95 | <= 120 ms | > 200 ms |
| Write-to-visible freshness p95 | <= 2 s | > 5 s |
| Write-to-visible freshness p99 | <= 5 s | > 10 s |
| Search endpoint error rate | <= 0.1% | > 0.5% |
| Same-user read-after-write miss | < 0.1% | >= 0.5% |

### 10.3 Workload methodology

1. Fixed dataset profiles:
   - small org
   - medium org
   - large org
2. Query classes:
   - action phrases
   - name/prefix queries
   - typo queries
   - mixed intent queries
3. Run style:
   - warmup period
   - multiple independent runs per option
   - capture p50/p95/p99 and variance

### 10.4 Experiment matrix

| Experiment | Option | Environment | Owner | Output |
|---|---|---|---|---|
| E1 | A (PG FTS + trgm) | local + staging | API/DB | latency + relevance + ops notes |
| E2 | B (PG18 BM25 path + trgm) | local + staging | API/DB | latency + relevance + ops notes |
| E3 | D (Meilisearch) | staging | API/Platform | sync lag + latency + ops overhead |
| E4 | E (Typesense) | staging | API/Platform | latency + memory profile + HA complexity |

Notes:

1. Option C (Neon pg_search) runs only if environment compatibility is established.
2. Option F (Elastic/OpenSearch) is evaluated by paper analysis unless trigger thresholds demand full POC.

## 11. Candidate Common Interface (Independent of Engine)

### 11.1 API candidate

`GET /v1/search/global`

Inputs:

1. `q` (string, required)
2. `limit` (default 12, max 20)
3. `lane` (`all|act|open|go`, optional)

Response:

1. `items: SearchResult[]`
2. `meta: { tookMs, source }`

SearchResult candidate shape:

1. `kind` (`action|client|appointment|navigation`)
2. `id`
3. `title`
4. `subtitle`
5. `score`
6. `to`
7. `search` params payload

### 11.2 Data model candidate

`search_documents` projection (if selected path uses projection):

1. `org_id`
2. `entity_kind`
3. `entity_id`
4. `title`
5. `subtitle`
6. `aliases`
7. `keywords`
8. `starts_at`
9. `payload`
10. `updated_at`

## 12. Frontend Integration Options (Decision Pending)

### 12.1 Option UI-A: Central command registry

1. Global command/shortcut registry with route-level registration.
2. Better consistency and conflict control.
3. Higher refactor cost.

### 12.2 Option UI-B: Incremental contributions API

1. Keep existing global palette shell.
2. Add route-level command contribution hooks.
3. Lower migration risk, less global consistency.

### 12.3 Option UI-C: URL-driven palette state

1. Palette state in URL for deep-linking.
2. Most complex interaction semantics.
3. Higher risk of search-param conflicts.

Current recommendation for implementation risk profile: start with UI-B or UI-A, avoid UI-C for first release.

## 13. Security and Tenancy Requirements

1. All result sets must be scoped to active org.
2. Enforce org filtering at query source, not only in app memory.
3. External engines must include mandatory org filter at query level.
4. Log/telemetry policy must avoid leaking sensitive PII.
5. Required test: prove cross-org leakage cannot occur.

## 14. Rollout and Operations Plan

### 14.1 Rollout phases

1. Internal flag-only.
2. Canary (small org subset).
3. Partial rollout.
4. Full rollout.

### 14.2 Required observability before canary

1. Dashboard for latency/error/freshness.
2. Dashboard for product funnel:
   - opened
   - query typed
   - result selected
   - action completed
3. Alerting thresholds tied to rollback criteria.

### 14.3 Rollback requirements

1. Feature flag kill switch to return to current static palette behavior.
2. If external engine selected, fallback must preserve navigation and core actions.

## 15. Maintenance Model

1. Product owner: outcome metrics and scope.
2. Admin UI owner: interaction quality and keyboard regressions.
3. API owner: endpoint and ranking logic.
4. DB/platform owner: indexing health, extension lifecycle, reindex routines.
5. Monthly relevance review and top failed query triage.

## 16. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Search relevance underperforms | Low adoption | relevance fixtures, staged tuning loop |
| Shortcut/modal interaction regressions | UX breakage | integration tests for dialog suppression + URL-state transitions |
| Index lag/staleness | user mistrust | freshness SLO + lag alerts + replayable sync |
| External engine drift | inconsistent results | outbox retry, reconciliation jobs, drift dashboards |
| Extension maturity concerns | delivery risk | fallback option, explicit go/no-go gates |

## 17. Open Questions (Need Owner + Date)

1. Should destructive appointment actions be in v1 command center or detail-first only?
2. Which engine options proceed to hands-on POC (`A+B` only, or include `D/E`)?
3. What exact dataset size defines staging acceptance benchmarks?
4. Do we require strict sub-second read-after-write semantics for all writes?
5. What is the maximum acceptable monthly operational toil budget?
6. Is Neon compatibility in scope for this feature cycle?

## 18. Immediate Next Steps

1. Assign owners and due dates for open questions.
2. Build benchmark fixture dataset and harness.
3. Execute E1 and E2 first (Postgres-native options).
4. Decide whether to run E3/E4 based on early results and capacity.
5. Finalize architecture decision in a follow-up RFC decision record.

## 19. Source Links (External Research)

1. PostgreSQL FTS ranking and query controls: https://www.postgresql.org/docs/current/textsearch-controls.html
2. PostgreSQL FTS index guidance: https://www.postgresql.org/docs/current/textsearch-indexes.html
3. PostgreSQL `pg_trgm`: https://www.postgresql.org/docs/current/pgtrgm.html
4. Timescale `pg_textsearch`: https://github.com/timescale/pg_textsearch
5. Neon `pg_search` announcement/docs entry: https://neon.com/blog/pgsearch-on-neon
6. ParadeDB architecture: https://docs.paradedb.com/welcome/architecture
7. Meilisearch async tasks: https://www.meilisearch.com/docs/learn/async/asynchronous_operations
8. Typesense high availability: https://typesense.org/docs/guide/high-availability.html
9. Typesense production behavior: https://typesense.org/docs/guide/running-in-production.html
10. Typesense sizing: https://typesense.org/docs/guide/system-requirements.html
11. Elasticsearch near real-time behavior: https://www.elastic.co/guide/en/elasticsearch/reference/current/near-real-time.html
12. Elasticsearch/OpenSearch refresh and similarity references:
    - https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
    - https://docs.opensearch.org/latest/api-reference/index-apis/refresh/

## 20. Appendix: Current Code Touchpoints

1. `apps/admin-ui/src/components/command-palette.tsx`
2. `apps/admin-ui/src/hooks/use-keyboard-shortcuts.ts`
3. `apps/admin-ui/src/routes/_authenticated/appointments/index.tsx`
4. `apps/admin-ui/src/routes/_authenticated/clients.tsx`
5. `apps/api/src/repositories/clients.ts`
6. `apps/api/src/repositories/appointments.ts`
7. `apps/api/src/routes/index.ts`
8. `packages/db/src/schema/index.ts`
9. `packages/db/src/migrations/20260208064434_init/migration.sql`

