# Cmd+K Global Command Center Plan

Status: Implementation Plan (not scheduled)  
Last Updated: 2026-02-22  
Owners: Product, `@scheduling/admin-ui`, `@scheduling/api`, `@scheduling/db`  
Related: `PRD.md`, `AGENTS.md`, `apps/admin-ui/src/components/command-palette.tsx`

## 1. Purpose

Define the architecture decision and implementation plan for a command-first global search and action surface (`Cmd/Ctrl+K`) focused on appointment scheduling speed.

This document is now both:

1. The architecture decision record for v1.
2. The execution plan for implementation when scheduled.

## 2. Decision Summary

### 2.1 Chosen v1 architecture

Use **Postgres-native search** (`tsvector` + `ts_rank_cd` + `pg_trgm`) behind a provider boundary.

### 2.2 Why this is the v1 choice

1. Lowest operational complexity for current team size.
2. Strong tenancy guarantees with existing RLS + `setOrgContext` patterns.
3. Fastest path to production quality with current infra.
4. Keeps engine swap possible without exposing engine details to callers.

### 2.3 Deferred options

Keep external engines and BM25 extension paths as re-evaluation candidates, not v1 defaults:

1. PG18 BM25 extension path.
2. Meilisearch.
3. Typesense.
4. Elastic/OpenSearch.
5. Neon `pg_search` (only if environment constraints are addressed).

### 2.4 Re-evaluation triggers

Re-open engine decision only if one of these is true after tuning:

1. API search latency p95 remains above `200 ms` for two consecutive weeks.
2. Same-user read-after-write miss rate is `>= 0.5%` at p95.
3. Relevance quality blocks adoption and cannot be improved with ranking weights/aliases.
4. Expected dataset scale exceeds agreed large-org benchmark envelope.

## 3. Product Scope

### 3.1 In scope for v1

1. Global invocation from authenticated routes.
2. Mixed results across:
   - actions
   - appointments
   - clients
   - navigation targets
3. Core execution intents:
   - open client details
   - open appointment details
   - create appointment
   - create appointment prefilled from client
4. Keyboard-first interactions (`Cmd/Ctrl+K`, `Esc`, arrow navigation, `Enter`).
5. Feature-flag rollout and kill switch.

### 3.2 Out of scope for v1

1. Natural-language assistant behavior.
2. Cross-org search.
3. Destructive actions directly from command center.
4. Replacing existing CRUD entry points.

## 4. Contract Boundaries

### 4.1 API contract decision

The API returns **domain intents**, not frontend route/search-param internals.

Rationale:

1. Prevents backend contract coupling to TanStack Router query shapes.
2. Reduces change amplification when UI routes/search params change.
3. Keeps backend reusable for non-admin clients in the future.

### 4.2 Candidate endpoint

`GET /v1/search/global`

Inputs:

1. `q` (string, required)
2. `limit` (default `12`, max `20`)
3. `lane` (`all|act|open|go`, optional)

Response:

1. `items: SearchResult[]`
2. `meta: { tookMs, source }`

`SearchResult` candidate shape:

1. `kind` (`action|client|appointment|navigation`)
2. `id` (stable item identifier)
3. `title`
4. `subtitle`
5. `score`
6. `intent` (domain action payload)

`intent` union for v1:

1. `{ type: "open_client_details", clientId: string }`
2. `{ type: "open_appointment_details", appointmentId: string }`
3. `{ type: "create_appointment" }`
4. `{ type: "create_appointment_for_client", clientId: string }`
5. `{ type: "navigate", target: "appointments" | "clients" | "settings" }`

### 4.3 Frontend mapping rule

UI resolves `intent` to route + search params in one adapter layer inside admin-ui. No API response field may contain `to` or raw route `search` payloads.

## 5. Data and Query Model

### 5.1 Tenancy and safety requirements

1. All queries must execute with active org context (`setOrgContext`).
2. Org filtering must be enforced in SQL source queries.
3. Telemetry must avoid PII leakage.

### 5.2 v1 indexing approach

Use source tables directly first. Do not introduce `search_documents` projection unless measurements prove it is needed.

Why:

1. Fewer moving parts and less drift risk.
2. No async sync lag surface in v1.
3. Lower cognitive load while feature is maturing.

### 5.3 Query behavior requirements

1. Deterministic ordering for same query + data snapshot.
2. Stable tie-breakers (`score DESC`, then deterministic secondary keys).
3. Prefix and typo rescue with `pg_trgm` fallback.
4. Empty query returns curated actions + recents (no full-table scan behavior).

## 6. Frontend Integration Plan

### 6.1 Integration approach

Use **incremental contributions** (current shell + route-level contributions), then consolidate to central registry only if inconsistency appears.

### 6.2 Execution behavior

1. Preserve URL-driven modal anti-flicker patterns.
2. Resolve intent in one place and call router navigation with consistent search-param merge rules.
3. Keep command palette state local (not URL-driven) for v1.

## 7. Implementation Phases

This plan is implementation-ready but not scheduled.

### Phase 0: Contracts and fixtures

1. Define `SearchResult` + `intent` DTOs in `packages/dto`.
2. Add ranking fixture set (queries + expected top results) for clients/appointments/actions.
3. Add perf fixture dataset profiles: small, medium, large org.

Exit criteria:

1. Contract reviewed by API + admin-ui owners.
2. Fixture set committed and runnable.

### Phase 1: API search endpoint

1. Implement `GET /v1/search/global` in API routes.
2. Add repository-level query helpers for client + appointment search.
3. Add lane filtering and deterministic ranking composition.
4. Add endpoint metrics (`tookMs`, error rate, zero-results).

Exit criteria:

1. API tests pass for ranking, tenancy, and pagination behavior.
2. p95 latency meets target on benchmark fixture data.

### Phase 2: Admin UI integration

1. Replace static-only palette behavior with mixed local + remote results.
2. Add debounced search query integration.
3. Add intent-to-route adapter and execute actions through it.
4. Keep existing keyboard shortcut framework and command help integration consistent.

Exit criteria:

1. Keyboard-only core flows succeed end-to-end.
2. No modal close/open flicker regressions in target flows.

### Phase 3: Rollout and guardrails

1. Ship behind feature flag.
2. Enable internal, then canary, then broader rollout.
3. Enforce rollback thresholds with alerts.

Exit criteria:

1. Error rate and latency within thresholds during canary.
2. No cross-org leakage incidents.

## 8. Testing Plan

### 8.1 API tests

1. RLS tenancy isolation and cross-org leakage prevention.
2. Ranking determinism for fixed fixture snapshots.
3. Lane filtering correctness.
4. Empty-query curated response behavior.
5. Input validation and limit enforcement.

### 8.2 UI tests

1. Keyboard interaction tests (`Cmd/Ctrl+K`, `Esc`, arrow keys, enter).
2. Intent mapping tests for each supported intent.
3. URL-driven modal regression tests (no empty-shell flashes).
4. Command palette funnel tests (open -> query -> select -> action completed).

### 8.3 Benchmark harness

Collect p50/p95/p99 for:

1. API search latency.
2. Keystroke-to-render latency.
3. Write-to-visible freshness.

## 9. SLOs and Rollback

### 9.1 Targets

1. API search latency p95: `<= 150 ms`
2. API search latency p99: `<= 300 ms`
3. Keystroke-to-render p95: `<= 120 ms`
4. Write-to-visible freshness p95: `<= 2 s`
5. Search endpoint error rate: `<= 0.1%`
6. Same-user read-after-write miss: `< 0.1%`

### 9.2 Rollback thresholds

1. API p95 `> 200 ms` sustained over alert window.
2. Error rate `> 0.5%`.
3. Same-user read-after-write miss `>= 0.5%`.
4. Any confirmed cross-org leakage.

Rollback action:

1. Disable feature flag and return to static palette behavior.

## 10. Ownership Model

1. Product owner: outcome metrics, adoption, scope.
2. Admin UI owner: interaction quality, keyboard behavior, intent adapter.
3. API owner: endpoint behavior, ranking, observability.
4. DB owner: index tuning and query performance.

At scheduling kickoff, add named individuals and target dates for each phase.

## 11. Decisions Locked for v1

1. API returns domain intents, not route internals.
2. v1 engine is Postgres-native (`tsvector` + `pg_trgm`).
3. No external search service in v1.
4. No URL-driven palette state in v1.
5. No destructive command actions in v1.

## 12. Deferred Questions (Kickoff)

1. Exact benchmark large-org dataset ceiling.
2. Whether recents are user-local only or server-backed.
3. Whether to expand `navigate` intents beyond initial targets.

## 13. Source Links

1. PostgreSQL FTS ranking and query controls: https://www.postgresql.org/docs/current/textsearch-controls.html
2. PostgreSQL FTS index guidance: https://www.postgresql.org/docs/current/textsearch-indexes.html
3. PostgreSQL `pg_trgm`: https://www.postgresql.org/docs/current/pgtrgm.html
4. Meilisearch async tasks: https://www.meilisearch.com/docs/learn/async/asynchronous_operations
5. Typesense high availability: https://typesense.org/docs/guide/high-availability.html
6. Elasticsearch near real-time behavior: https://www.elastic.co/guide/en/elasticsearch/reference/current/near-real-time.html

## 14. Current Code Touchpoints

1. `apps/admin-ui/src/components/command-palette.tsx`
2. `apps/admin-ui/src/hooks/use-keyboard-shortcuts.ts`
3. `apps/admin-ui/src/routes/_authenticated/appointments/index.tsx`
4. `apps/admin-ui/src/routes/_authenticated/clients.tsx`
5. `apps/api/src/repositories/clients.ts`
6. `apps/api/src/repositories/appointments.ts`
7. `apps/api/src/routes/index.ts`
8. `packages/db/src/schema/index.ts`
9. `packages/db/src/migrations/20260208064434_init/migration.sql`
