# Domain & Seam Glossary

Ubiquitous language for the scheduling platform, plus the architectural seams agreed during design review. Architecture terms (module, interface, seam, deep/shallow, leverage, locality) follow the deep-module vocabulary. Runtime detail lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Domain

- **Org** — a tenant. Every org-scoped row carries `org_id`, isolated by Postgres RLS via `current_org_id()`.
- **Calendar** — a bookable resource owning availability rules, overrides, and blocked time.
- **Appointment type** — a bookable offering with duration, padding, capacity, and resource requirements.
- **Appointment** — a booked slot on a calendar for a client, with a lifecycle status (`scheduled`, `confirmed`, `cancelled`, `no_show`).
- **Availability slot** — a candidate time window evaluated against constraints to decide if it is bookable. See [[slot-evaluation]].
- **Journey** — a graph-based automation triggered by appointment or client domain events.
- **Workflow graph** — the node/edge definition behind a journey. Edges encode branches. See [[edge-branch]].

## Seams

### org-scoped-transaction
The single seam carrying tenant context to the database. `withOrg(orgId, fn)` opens a transaction, sets `app.current_org_id` once, and yields a branded `OrgScopedTx` (a phantom-typed `DbClient`). Repository methods require `OrgScopedTx` and no longer accept `orgId` or call `setOrgContext`; querying an RLS table without org context becomes a compile error. Writes omit `org_id` (column default `current_org_id()`); the `WITH CHECK` policy still holds. This is the deep seam behind candidate 1 of the architecture review.

### slot-evaluation
The single in-process module that decides whether an [[availability slot]] is bookable. `evaluateSlot(slot, constraints, existing, now)` applies the shared filters (notice, past, blocked, daily, weekly). The capacity rule is a discriminated **slot-constraint** set: `kind: "type"` (per-appointment-type capacity, padding, resources) for booking, `kind: "perSlot"` for the type-agnostic editor preview. Candidate generation and the schedule-shading feed share pure date primitives (`sundayZeroWeekday`, `parseHm`, `setZonedTime`) in `calendar-time`. The feed keeps its band output; the engine keeps override precedence. Candidate 2 of the review.

### edge-branch
The meaning of a [[workflow graph]] edge: a **condition branch** (`true` / `false`) or a **trigger branch** (`scheduled` / `canceled` / `no_show`). An edge records its branch in both `sourceHandle` (so React Flow draws from the right handle) and `data.*` (the semantic record, authoritative, with `sourceHandle` as fallback). One pure module, `graph-branches`, owns interpretation and labels; its branch types derive from a typed edge-attributes schema in `@scheduling/dto`. Candidate 3 of the review.

### node-execution
The seam between walking a [[journey]] run and executing one of its nodes. The run executor walks the pinned [[workflow graph]] and delegates each node to its **node handler** (`journey-run-handlers/`). A handler owns one node type's full lifecycle: its durable-step sequence, its projection writes (via the shared run-artifacts upserts), its config resolution, and — for wait and wait-for-confirmation — its own context reload after a durable suspend. A handler returns `advance` (next node ids plus a possibly-updated cursor and context) or `terminate` (a final run result); the executor stays the pure walker (fan-out, cycle guard, result combination) and keeps run-level lifecycle (load, start, finalize). **Step** is reserved for the durable Inngest primitive (`runStep` / `sleepUntil` / `waitForEvent`); one node handler issues one or more steps. The deep seam is the injected step runtime (`JourneyRunStepRuntime`): Inngest in production, a fake in tests. See [[edge-branch]]. Candidate 4 of the review.
