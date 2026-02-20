# Client-Triggered Journeys Plan

## Objective
Add a new journey trigger type for client lifecycle events, with an initial narrow scope:

- `client.created`
- `client.updated` with exactly one tracked custom attribute key
- Replan when the tracked attribute value changes

This plan follows a strategic, complexity-reducing path:

1. Pre-refactor core trigger/run boundaries first (no behavior change)
2. Implement the client-trigger feature on top of those boundaries

## Constraints and Design Rules
- No backward-compatibility shims are required (active development stage).
- No new incremental DB migrations: update the existing init migration SQL directly, then run `pnpm --filter @scheduling/db run push`.
- Keep one clear approach, not configurable variants.
- Preserve existing appointment-journey behavior during pre-refactor.

## Design Twice

### Option A (selected): Typed Trigger Engines
Introduce a small trigger-engine boundary in planner internals with two engines:

- `AppointmentJourneyEngine`
- `ClientJourneyEngine`

Planner calls a single engine interface for:

- config parsing/normalization
- event routing (`plan`/`cancel`/`ignore`)
- run identity extraction
- filter context extraction
- execution context hydration

Why selected:
- Keeps UI and DTO obvious for common cases.
- Contains complexity inside planner internals.
- Avoids exposing generic event-routing complexity to admins.

### Option B (rejected for now): Fully Generic Domain Event Trigger for Journeys
Use one generic `DomainEvent` trigger config with arbitrary start/restart/stop sets and correlation paths.

Why not now:
- Higher cognitive load in UI and validations.
- Easier to misconfigure.
- More abstraction than needed for current use case.

## Scope

### In Scope
- New `ClientJourney` trigger config and editor UX.
- Client-based run identity.
- Replanning on tracked attribute change.
- Reuse current trigger filter AST/operators.

### Out of Scope
- Multiple tracked attributes in one trigger.
- New trigger families beyond appointment/client.
- Generic expression-based diff logic.
- Historical data migration tooling.

## Phase 0: Pre-Refactor (No Behavior Change)

### Status
- Completed on February 20, 2026.
- All Phase 0 slices (0.1-0.5) are implemented and validated (`pnpm format`, `pnpm typecheck`, `pnpm lint`, `pnpm test`).

### 0.1 DTO Boundary: Trigger Config Must Be a Union
Goal: stop hardcoding appointment trigger config at schema root.

Files:
- `packages/dto/src/schemas/workflow-graph.ts`
- `packages/dto/src/schemas/journey.ts`
- DTO tests under `packages/dto/src/schemas/*.test.ts`

Changes:
- Convert `journeyTriggerConfigSchema` from single literal object to discriminated union with at least:
  - `AppointmentJourney` (current shape unchanged)
  - placeholder `ClientJourney` schema (can be added in Phase 1 if preferred, but union boundary is established in Phase 0)
- Remove/replace fixed-error wording in `linearJourneyGraphSchema` validation:
  - current message: "Trigger step must use the fixed appointment journey trigger configuration"
- Keep filter schema and operators unchanged.

Acceptance:
- Existing appointment-trigger graph snapshots still parse.
- DTO tests pass with no behavior regressions.

### 0.2 Run Identity Boundary: Decouple from `appointmentId` as Primary Key
Goal: planner should not assume `appointmentId` is the only run identity.

Files:
- `packages/db/src/schema/index.ts`
- `packages/db/src/migrations/20260208064434_init/migration.sql`
- `packages/db/src/journeys.constraints.test.ts`

Proposed schema adjustments:
- Add run identity fields to `journey_runs`:
  - `trigger_entity_type` (enum/text; values: `appointment`, `client`)
  - `trigger_entity_id` (uuid)
- Keep `appointment_id` for appointment-specific context (make nullable if needed).
- Add nullable `client_id` for direct client context loading.
- Replace uniqueness index:
  - from `(org_id, journey_version_id, appointment_id, mode)`
  - to `(org_id, journey_version_id, trigger_entity_type, trigger_entity_id, mode)`
- Keep RLS and status indexes intact.

Acceptance:
- DB schema compiles/pushes.
- Constraint tests updated and passing.

### 0.3 Planner Trigger Engine Extraction
Goal: remove appointment-specific routing/identity logic from planner entry point.

Files:
- `apps/api/src/services/journey-planner.ts`
- New internal module, e.g. `apps/api/src/services/journey-trigger-engines.ts`
- `apps/api/src/services/journey-planner.test.ts`

Refactor tasks:
- Extract current logic from:
  - `extractAppointmentId`
  - `resolveTriggerRouting`
  - `getTriggerConfig`
  into a trigger-engine module.
- Planner loop uses engine API only.
- Keep existing appointment behavior exactly as-is.

Acceptance:
- Planner tests remain green with no snapshot behavior changes.

### 0.4 Context Loading Boundary (Prep for Non-Appointment Runs)
Goal: isolate context hydration so worker/wait-resume are not appointment-hardcoded.

Files:
- `apps/api/src/services/journey-template-context.ts`
- `apps/api/src/services/journey-planner.ts` (wait resume path)
- `apps/api/src/services/journey-delivery-worker.ts`
- `apps/api/src/services/journeys.ts` (run detail trigger context)

Refactor tasks:
- Introduce one internal context loader by run identity:
  - appointment run -> existing appointment+client hydration
  - client run -> client hydration (Phase 1 behavior)
- Keep wait-resume behavior unchanged for appointment runs.

Acceptance:
- No behavioral changes for existing appointment journeys.
- Code paths no longer assume every run has `appointmentId`.

### 0.5 UI Boundary: Remove Forced Canonical Appointment Config
Goal: editor store should not rewrite every trigger to appointment-only config.

Files:
- `apps/admin-ui/src/features/workflows/workflow-editor-store.ts`
- `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`

Refactor tasks:
- Remove hardcoded `getCanonicalTriggerConfig()` replacement behavior.
- Keep current appointment trigger UX defaulted, but structurally support multiple trigger types.

Acceptance:
- Existing journey editor still works for appointment journeys.
- Trigger config shape round-trips without forced overwrite.

## Phase 1: Client Journey Feature Implementation

### 1.1 DTO: `ClientJourney` Trigger Config
Files:
- `packages/dto/src/schemas/workflow-graph.ts`
- `packages/dto/src/schemas/journey.ts`
- DTO tests

Add:
- `ClientJourney` config:
  - `triggerType: "ClientJourney"`
  - `event: "client.created" | "client.updated"`
  - `correlationKey: "clientId"`
  - `trackedAttributeKey?: string`
  - `filter?: JourneyTriggerFilterAst`

Validation rules:
- If `event === "client.updated"`, require non-empty `trackedAttributeKey`.
- If `event === "client.created"`, `trackedAttributeKey` must be absent.

### 1.2 Inngest: Register Client Domain Trigger Functions
Files:
- `apps/api/src/inngest/functions/journey-domain-triggers.ts`
- tests for this file (add/adjust)

Changes:
- Extend journey trigger event list to include:
  - `client.created`
  - `client.updated`
- Keep payload validation via `domainEventDataSchemaByType[eventType]`.

### 1.3 Planner: Implement `ClientJourneyEngine`
Files:
- `apps/api/src/services/journey-trigger-engines.ts` (new)
- `apps/api/src/services/journey-planner.ts`
- `apps/api/src/services/journey-planner.test.ts`

Routing semantics:
- `client.created` journey:
  - route `plan` on `client.created`; ignore others
- `client.updated` journey:
  - route `plan` only when tracked attribute changed:
    - compare `payload.previous.customAttributes[trackedAttributeKey]`
    - against `payload.customAttributes[trackedAttributeKey]`
  - ignore if unchanged

Run identity:
- use `client.id` as trigger entity id.

Replanning behavior:
- For `plan` events, existing reconciliation already cancels stale planned deliveries and creates new desired deliveries.
- If tracked attribute is cleared and desired schedule is empty, stale planned deliveries are canceled by reconcile.

### 1.4 Filter Context Rules by Trigger Type
Files:
- `apps/api/src/services/journey-trigger-filters.ts`
- `apps/admin-ui/src/features/workflows/filter-builder-shared.ts`
- `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`

Rules:
- Appointment journey: allow current appointment + client fields.
- Client journey: allow client fields only (including `client.customAttributes.*`).

Note:
- Keep one filter AST schema/operator set; scope available fields by trigger type in UI and context extraction.

### 1.5 UI: Client Trigger Configuration UX
Files:
- `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`
- `apps/admin-ui/src/features/workflows/workflow-editor-sidebar.tsx`
- `apps/admin-ui/src/features/workflows/workflow-editor-store.ts`
- `apps/admin-ui/src/features/workflows/workflow-trigger-config.test.tsx`

UX changes:
- Add trigger type selector (`AppointmentJourney` / `ClientJourney`).
- For `ClientJourney` show:
  - event selector (`client.created` / `client.updated`)
  - tracked attribute selector (required for `client.updated`) sourced from custom attribute definitions.
- Update copy:
  - replace appointment-specific phrasing in audience rules/help text when client trigger is active.

### 1.6 Run Detail and Delivery Context for Client Runs
Files:
- `apps/api/src/services/journeys.ts`
- `apps/api/src/services/journey-template-context.ts`
- `apps/api/src/services/journey-delivery-worker.ts`
- relevant tests

Changes:
- Ensure run detail `triggerContext` can render client-trigger runs without requiring appointment record.
- Ensure delivery/template context resolves for client-trigger runs.
- Keep appointment-trigger behavior unchanged.

## Test Plan

### Unit/Schema
- DTO trigger schema tests:
  - valid `ClientJourney` (`client.created`, `client.updated`)
  - invalid combinations (missing/extra `trackedAttributeKey`)
- Filter tests:
  - client-trigger field availability and evaluation

### Planner/Service
- `journey-planner.test.ts` scenarios:
  - `client.created` starts run and schedules deliveries
  - `client.updated` with changed tracked attribute replans
  - `client.updated` with unchanged tracked attribute ignored
  - `client.updated` clearing tracked value cancels stale planned deliveries
  - appointment journeys unchanged

### Inngest Triggering
- function registration/dispatch tests for client events.

### DB Constraints
- `journey_runs` new identity index and nullable context fields.

### UI
- trigger config tests:
  - toggle trigger type
  - require tracked attribute for `client.updated`
  - field options scope by trigger type

## Execution Order
1. Phase 0.1 DTO trigger union boundary
2. Phase 0.2 DB run identity boundary
3. Phase 0.3 planner engine extraction
4. Phase 0.4 context loader boundary
5. Phase 0.5 UI boundary cleanup
6. Phase 1.1-1.6 client feature
7. Full test + lint + typecheck + format pass

## Validation Commands (must all pass)
- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

DB sync after schema edits:
- `pnpm --filter @scheduling/db run push`
- `pnpm db:seed` (if seed is affected)

## Definition of Done
- Client journeys can be authored in admin UI.
- `client.created` and `client.updated` triggers function end-to-end.
- `client.updated` replans only on tracked attribute change.
- No appointment-journey regressions.
- All checks pass (`format`, `lint`, `typecheck`, `test`).
