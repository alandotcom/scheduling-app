# Queue Operations UI Research (pg-boss + Workflow DevKit)

- Date: February 10, 2026
- Repo: `/Users/alancohen/projects/scheduling-app`
- Request: Evaluate Bull-Board-like queue operations UI options for the accepted migration to pg-boss + Workflow DevKit, including existing tools, custom UI feasibility (React + TanStack), API/security requirements, and observability integration.

## 1. Executive Summary

### Key findings

1. There is **no official pg-boss dashboard** from the pg-boss project.
2. Workflow DevKit has an **official observability stack** (CLI + web UI), including a published `@workflow/web` package and `workflow web` command.
3. Community pg-boss dashboards exist, but they are mostly low-maturity and vary significantly in safety/tenancy posture.
4. In this repo, a **custom admin UI is feasible and structurally aligned** with current patterns (TanStack Router/Query + oRPC + `adminOnly` guards), but should be scoped to operational essentials first.

### Recommended path

Use a **hybrid strategy**:

1. Adopt **Workflow DevKit official web UI** for workflow-run observability and debugging.
2. Build a **small custom Queue Ops section** in your existing admin app for pg-boss queue/job actions you need day-to-day.
3. Avoid adopting community dashboards as your primary long-term ops UI unless you accept higher maintenance/security risk.

This best matches your architecture RFC and preserves product UI consistency while minimizing lock-in to unmaintained side tools.

---

## 2. Current Repo Context (What Matters for This Decision)

### Runtime direction (already decided in-repo)

Your accepted RFC (updated February 10, 2026) sets direction to:

- replace BullMQ/Valkey with pg-boss for event bus + jobs,
- adopt Workflow DevKit Postgres World for durable workflows,
- migrate in phased dual-run with parity checks.

Reference: `docs/event-bus-workflow-runtime-rfc.md`.

### Current queue UI baseline

- You currently run Bull Board in a separate Hono process (`apps/api/src/bull-board.ts`) against BullMQ queues.
- It currently initializes queues directly and mounts board routes; there is no in-file auth middleware protecting Bull Board routes.
- Default host binding for bull-board is `127.0.0.1` from config, which reduces exposure in local/dev but is not a full auth model.

References:
- `apps/api/src/bull-board.ts`
- `apps/api/src/config.ts`

### Admin app and API patterns you can reuse

- Frontend: React 19 + TanStack Router/Query + oRPC client.
- Backend auth/authorization: `authMiddleware`, `authed`, `adminOnly` route guards.
- Existing settings sections already integrate operational external UI patterns (example: webhooks session endpoint + provider UI embedding).

References:
- `apps/admin-ui/src/routes/_authenticated/settings.tsx`
- `apps/admin-ui/src/components/settings/webhooks/webhooks-section.tsx`
- `apps/api/src/routes/base.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/middleware/auth.ts`

---

## 3. Tooling Landscape

## 3.1 Official tooling

### pg-boss (official)

- pg-boss provides queue/job APIs (`getQueues`, `getQueue`, `getQueueStats`, `findJobs`, `retry`, `cancel`, `resume`, `delete*`, etc.), events (`error`, `warning`, `wip`, `bam`), and CLI for schema ops.
- pg-boss docs do **not** provide an official dashboard product.

Primary sources:
- pg-boss repo and docs: <https://github.com/timgit/pg-boss>
- API docs:
  - ops: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/ops.md>
  - queues: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/queues.md>
  - jobs: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/jobs.md>
  - workers: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/workers.md>
  - events: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/events.md>

### Workflow DevKit (official)

Workflow DevKit includes first-party observability:

- `workflow inspect ...`
- `workflow web` / `workflow inspect runs --web`
- published `@workflow/web` package (self-hostable)
- Postgres World docs explicitly describe workflow observability via CLI/Web.

Primary sources:
- Observability docs: <https://raw.githubusercontent.com/vercel/workflow/main/docs/content/docs/observability/index.mdx>
- Postgres world docs: <https://raw.githubusercontent.com/vercel/workflow/main/docs/content/docs/deploying/world/postgres-world.mdx>
- `@workflow/web` README: <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/README.md>
- Workflow web + server action source:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/src/server/workflow-server-actions.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/src/components/run-actions.tsx>
- CLI inspect/web source:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/cli/src/commands/inspect.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/cli/src/commands/web.ts>

## 3.2 Community tooling (pg-boss ecosystem)

Notable options found:

- `pg-boss-dashboard` (yogsma)
- `pg-boss-admin-dashboard` (lpetrov)
- `pg-bossman` built-in SSR dashboard
- `pg-boss-bull-board` (BullMQ-compat wrapper + bull-board bridge)

NPM metadata confirms these are community packages, separate from pg-boss core.

Primary sources:
- `pg-boss-dashboard`: <https://www.npmjs.com/package/pg-boss-dashboard>
- `pg-boss-admin-dashboard`: <https://www.npmjs.com/package/pg-boss-admin-dashboard>
- `pg-bossman`: <https://www.npmjs.com/package/pg-bossman>
- `pg-boss-bull-board`: <https://www.npmjs.com/package/pg-boss-bull-board>
- Corresponding GitHub READMEs/source (linked in Sources section)

---

## 4. Option-by-Option Evaluation

## 4.1 Keep Bull Board only (status quo during transition)

What it gives:

- Familiar operational UI for current BullMQ queues.
- Zero near-term engineering cost while migration phases are ongoing.

Limits:

- Not aligned to final runtime (pg-boss + Workflow).
- Doesn’t cover workflow-run observability.
- If exposed beyond localhost without auth controls, security risk.

Best use:

- Temporary during Phase 0-3 transition; remove with BullMQ decommission.

## 4.2 Use Workflow DevKit official Web UI for observability

What it gives:

- Strong run/step/event/hook/stream diagnostics.
- Built-in operational actions in UI/server actions (`cancelRun`, `reenqueueRun`, `wakeUpRun`, `resumeHook`).
- Backend-aware configuration and health-check utilities.

Limits:

- It is workflow-centric, not a complete general queue dashboard for non-workflow queues.
- Separate UI surface from your product admin UI unless embedded/proxied.

Best use:

- Primary workflow reliability/debugging UI in production and staging.

## 4.3 Community pg-boss dashboards

### `pg-boss-dashboard`

- Minimal queue/job dashboard with separate API + UI packages.
- Uses direct SQL against `pgboss.job` in server code.
- Functional but limited docs and smaller ecosystem footprint.

### `pg-boss-admin-dashboard`

- Broader dashboard features (charts/search/actions), standalone Express app.
- Exposes powerful mutation endpoints that directly update/delete `pgboss.job` rows.
- Includes explicit warning in README not to expose publicly without auth.

### `pg-bossman` dashboard

- Provides `createDashboard` API with Hono SSR routes and typed wrapper experience.
- Better integration story if adopting pg-bossman itself.
- Still community-maintained and tied to pg-bossman abstraction choices.

### `pg-boss-bull-board`

- Attempts BullMQ-compatible interface over pg-boss + bull-board UX.
- Attractive for familiarity, but introduces adapter indirection and dependency risk.

Common caveat across community options:

- Security/tenancy assumptions are usually single-tenant internal ops.
- Maintenance risk is materially higher than first-party Workflow tooling or in-repo UI.

## 4.4 Build custom Queue Ops UI in this repo (React + TanStack + oRPC)

Feasibility: **High**

Why:

- Existing admin architecture already supports complex operational pages and server-authorized data flows.
- Existing `adminOnly` route guard and active-org session model can gate access cleanly.
- No backward-compatibility burden (per repo instructions), so API shape can be designed cleanly for ops needs.

What this enables:

- Queue operations in your existing product UI/permissions model.
- Org-aware presentation and masking/redaction policies.
- Tight integration with your own audit/logging conventions.

Tradeoff:

- More initial engineering work than running a standalone community dashboard.

---

## 5. Option Matrix

| Option | BullMQ now | pg-boss queue ops | Workflow observability | Security/tenancy fit for this repo | Eng effort | Ongoing risk | Notes |
|---|---:|---:|---:|---|---|---|---|
| Keep Bull Board only | High | None | None | Medium (needs explicit auth/proxy controls if exposed) | Low | Medium | Temporary bridge only |
| Workflow DevKit Web UI (`workflow web` / `@workflow/web`) | None | Low-Med (indirect via workflow actions) | High | High for workflow ops; separate surface | Low-Med | Low-Med | Official, best for run debugging |
| Community pg-boss dashboards | None | Med-High | None/Low | Low-Med (usually not org-aware by default) | Low-Med | High | Fastest standalone, higher trust/maintenance risk |
| Custom in-repo Queue Ops UI | None | High (what you implement) | Med-High (via workflow APIs/links) | High (uses your auth + org model) | Med | Low-Med | Best long-term product-integrated path |
| Hybrid (Workflow Web UI + custom minimal Queue Ops) | Temporary Bull Board until cutover | High | High | High | Med | Low-Med | **Recommended** |

---

## 6. Custom UI: Required API Surface (Proposed)

Use `adminOnly` oRPC routes under a dedicated namespace (example: `/v1/ops/*`).

## 6.1 Queue APIs (pg-boss)

Read APIs:

- `GET /v1/ops/queues` -> queue list + state counters (`getQueues` + `getQueueStats`).
- `GET /v1/ops/queues/{name}` -> queue metadata + stats + schedules.
- `GET /v1/ops/queues/{name}/jobs` -> paginated jobs with filters (`state`, `cursor/page`, `sort`, `id`, `singletonKey`).
- `GET /v1/ops/queues/{name}/jobs/{id}` -> full job detail.

Mutation APIs:

- `POST /v1/ops/queues/{name}/jobs/{id}/retry`
- `POST /v1/ops/queues/{name}/jobs/{id}/cancel`
- `POST /v1/ops/queues/{name}/jobs/{id}/resume`
- `DELETE /v1/ops/queues/{name}/jobs?mode=queued|stored|all` (careful gating)

Notes from pg-boss semantics:

- Queue-level “pause” is not a first-class global API; `offWork` is process-local worker control.
- Mutating actions should follow pg-boss method contracts, not direct table mutation where possible.

## 6.2 Workflow APIs (bridge to Workflow world)

Read APIs:

- `GET /v1/ops/workflow/runs`
- `GET /v1/ops/workflow/runs/{runId}`
- `GET /v1/ops/workflow/runs/{runId}/steps`
- `GET /v1/ops/workflow/runs/{runId}/events`
- `GET /v1/ops/workflow/runs/{runId}/streams`
- `GET /v1/ops/workflow/hooks`

Mutation APIs:

- `POST /v1/ops/workflow/runs/{runId}/cancel`
- `POST /v1/ops/workflow/runs/{runId}/reenqueue`
- `POST /v1/ops/workflow/runs/{runId}/wake-up`
- `POST /v1/ops/workflow/hooks/{hookId}/resume`

Health:

- `GET /v1/ops/workflow/health?endpoint=workflow|step`

Rationale:

- Mirrors capabilities already implemented in Workflow’s web server actions.

---

## 7. Security Constraints and Design Requirements

## 7.1 Access control

- Treat queue/workflow ops as **operational admin** capability, not general tenant feature.
- At minimum: `adminOnly` + explicit “Ops” entitlement/allowlist (recommended) to avoid broad org-admin access to platform-level queues.

## 7.2 Tenancy and data leakage

Important: pg-boss internal jobs are not inherently org-scoped tables in your app schema. If payloads include cross-org data, an org admin UI could leak data.

Controls:

- Prefer platform-ops visibility over per-org visibility unless strict filtering guarantees exist.
- If per-org views are required, enforce payload-level org filters and redact by default.

## 7.3 Action safety

- Require confirmation for destructive actions (clear queue, delete all jobs, forced retries).
- Use idempotency keys for mutation requests where reasonable.
- Add audit events for all operator actions (actor, action, target queue/job, before/after state).

## 7.4 Data handling

- Redact sensitive JSON fields in job payload/output in list views by default.
- Lazy-load full payloads with explicit “show sensitive fields” permission.
- Bound response sizes and enforce pagination limits.

## 7.5 Network exposure

- Do not expose raw standalone dashboards directly to public internet.
- If using standalone tools, front with auth proxy and network ACLs.

---

## 8. Observability Integration Strategy

## 8.1 What to use for what

- **Workflow run debugging:** Workflow Web UI / inspect CLI.
- **Queue backlog and operational actions:** custom in-repo Queue Ops page.
- **Business/system reliability metrics:** your own dashboards/alerts using RFC metric definitions.

## 8.2 Metrics and signals to integrate

From your RFC + pg-boss/Workflow capabilities:

- Queue depth by state and queue.
- Retry and failure rates.
- DLQ counts and oldest message age.
- Worker liveness and processing activity (`wip`, warning/error events).
- Workflow run latency, wake latency, cancellation outcomes, guard-blocked actions.

## 8.3 Tracing/logging

- Use structured logs for each queue/workflow mutation from UI.
- Workflow queue payload schema includes trace carrier support, enabling distributed trace propagation in custom worlds.

---

## 9. Recommended Implementation Plan

## Phase A (immediate)

1. Keep Bull Board only as temporary bridge while BullMQ remains.
2. Tighten access: ensure it remains localhost/internal-only and explicitly documented as temporary.

## Phase B (during pg-boss + Workflow rollout)

1. Enable Workflow observability in runbooks:
   - `workflow inspect runs --backend @workflow/world-postgres`
   - `workflow web --backend @workflow/world-postgres`
2. Add “Open Workflow Observability” entry in admin settings (external link/proxy target).

## Phase C (product-integrated ops)

1. Build `/settings?section=operations` in admin-ui.
2. Implement minimal queue APIs first: list queues, list jobs, retry/cancel/resume, queue clear with confirmation.
3. Add workflow run table and drill-in links (or deep links into Workflow web UI).

## Phase D (hardening)

1. Add audit logging for all ops actions.
2. Add redaction policies and per-field permissions.
3. Add SLO dashboards/alerts aligned to RFC section 9 metrics.

---

## 10. Final Recommendation

Adopt **Hybrid = Workflow official web observability + custom in-repo Queue Ops UI**, with Bull Board kept only as a short-term bridge during migration.

Why this is the best fit for this codebase:

- Aligns with your accepted architecture target (pg-boss + Workflow).
- Uses official Workflow tooling for the hardest observability/debugging workflows.
- Keeps queue operations in your existing auth/UI/tenant conventions.
- Avoids long-term dependency on lightly maintained third-party dashboards.

---

## Sources (Primary)

### In-repo

- `docs/event-bus-workflow-runtime-rfc.md`
- `docs/ARCHITECTURE.md`
- `apps/api/src/bull-board.ts`
- `apps/api/src/config.ts`
- `apps/api/src/routes/base.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/admin-ui/src/routes/_authenticated/settings.tsx`
- `apps/admin-ui/src/components/settings/webhooks/webhooks-section.tsx`

### pg-boss official

- Project: <https://github.com/timgit/pg-boss>
- README: <https://raw.githubusercontent.com/timgit/pg-boss/master/README.md>
- API: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/ops.md>
- API: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/queues.md>
- API: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/jobs.md>
- API: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/workers.md>
- API: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/events.md>
- SQL docs: <https://raw.githubusercontent.com/timgit/pg-boss/master/docs/sql.md>
- npm metadata: <https://www.npmjs.com/package/pg-boss>

### Workflow DevKit official

- Repo: <https://github.com/vercel/workflow>
- Package README: <https://raw.githubusercontent.com/vercel/workflow/main/packages/workflow/README.md>
- Observability docs: <https://raw.githubusercontent.com/vercel/workflow/main/docs/content/docs/observability/index.mdx>
- Postgres world docs: <https://raw.githubusercontent.com/vercel/workflow/main/docs/content/docs/deploying/world/postgres-world.mdx>
- Worlds manifest: <https://raw.githubusercontent.com/vercel/workflow/main/worlds-manifest.json>
- `@workflow/web` README: <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/README.md>
- CLI inspect/web:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/cli/src/commands/inspect.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/cli/src/commands/web.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/cli/src/lib/inspect/web.ts>
- Web server actions:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/src/server/workflow-server-actions.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/web/src/components/run-actions.tsx>
- World interface:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/world/src/interfaces.ts>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/world/src/queue.ts>
- Postgres world internals:
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/README.md>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/HOW_IT_WORKS.md>
  - <https://raw.githubusercontent.com/vercel/workflow/main/packages/world-postgres/src/queue.ts>

### Bull Board official

- Repo/README: <https://raw.githubusercontent.com/felixmosh/bull-board/master/README.md>
- npm metadata:
  - <https://www.npmjs.com/package/@bull-board/api>
  - <https://www.npmjs.com/package/@bull-board/hono>

### Community pg-boss dashboards/wrappers

- `pg-boss-dashboard`:
  - npm: <https://www.npmjs.com/package/pg-boss-dashboard>
  - repo: <https://github.com/yogsma/pg-boss-dashboard>
- `pg-boss-admin-dashboard`:
  - npm: <https://www.npmjs.com/package/pg-boss-admin-dashboard>
  - repo: <https://github.com/lpetrov/pg-boss-admin-dashboard>
- `pg-bossman`:
  - npm: <https://www.npmjs.com/package/pg-bossman>
  - repo: <https://github.com/ludicroushq/pg-bossman>
- `pg-boss-bull-board`:
  - npm: <https://www.npmjs.com/package/pg-boss-bull-board>
  - repo: <https://github.com/flywheeldynamix/fdx-pkg-engineering>

