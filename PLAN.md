# Workflow Backend Rewrite Plan (Integration-Free, Graph-First)

## 1. Objective

Rewrite the workflow backend so it is a pure graph-based orchestration engine with:

- Trigger support: `domain_event` and `schedule`
- Node kinds: `action`, `wait`, `condition`
- No workflow-level integration dependency (`integrationKey`, integration selectors, integration validation)

Svix remains a separate, already-working webhook delivery system and is **not** modeled as a workflow integration/action in this rewrite.

---

## 2. Product Constraints (Locked)

1. This is active development; breaking changes are acceptable.
2. No backward compatibility shims.
3. No new incremental DB migrations; update baseline/initial schema files if schema changes are needed.
4. Keep Svix subsystem untouched.
5. Workflow action catalog starts with first-party actions (no external integration actions).
6. First side-effect action: `core.emitInternalEvent`.

---

## 3. Scope

## In Scope

- DTO workflow schemas and types
- Workflow action registry and execution model
- Workflow compiler validation and compiled plan output
- Workflow runtime execution function (Inngest)
- Workflow catalog route output shape
- Workflow tests (registry/compiler/runtime/routes)

## Out of Scope (for this pass)

- Frontend workflow editor implementation
- Svix admin/webhook settings system
- Full removal of non-workflow integrations features across unrelated modules

---

## 4. Current-State Summary (Before Rewrite)

- Workflow action definitions currently include `integrationKey`.
- Compiler enforces integration-specific compatibility.
- Runtime passes `integrationKey` into action execution.
- Workflow catalog API exposes integration-linked action metadata.
- Test suite assumes channel actions like resend/twilio/slack.

This blocks a clean internal orchestration model and tightly couples workflows to integrations.

---

## 5. Target Architecture

## 5.1 Workflow Graph Contract

Canonical workflow graph document:

- `schemaVersion`
- `trigger`
  - `domain_event` with `domain`, `startEvents`, `restartEvents`, `stopEvents`, optional retry/debounce/replacement
  - `schedule` with `expression`, `timezone`, optional retry/replacement
- `nodes`
  - action node: `{ id, kind: "action", actionId, input?, guard? }`
  - wait node: `{ id, kind: "wait", wait }`
  - condition node: `{ id, kind: "condition", guard }`
- `edges`
  - directed edges with optional `branch` (`next|timeout|true|false`)

No `integrationKey` anywhere in workflow node schemas.

## 5.2 Action Registry Contract

Each action definition should include:

- `id`, `label`, `description`, `category`
- `configFields`, `outputFields`
- `inputSchema`
- `execute({ actionId, parsedInput, context })`

No `integrationKey` on action definitions.

## 5.3 Runtime Side-Effect Strategy

Action `core.emitInternalEvent` should:

- Validate typed event intent payload
- Return channel and output metadata
- Emit internal workflow intent/event (implementation detail can start as structured output + logging; later fanout worker can consume)

This preserves strict separation from Svix transport concerns.

---

## 6. Inngest Design Constraints (Research-Backed)

These constraints are mandatory for the rewrite and should be treated as implementation rules, not suggestions.

1. Deterministic execution model:
   - Any non-deterministic work (DB reads/writes, network calls, random/time-based logic) must run inside `step.run()` (or other step APIs), not in top-level handler flow.
   - Step IDs must be stable and derived from static workflow structure (`nodeId`/operation), never random.
2. Retry semantics:
   - Inngest retries failed steps automatically; function-level retry policy applies per step.
   - Use `NonRetriableError` for permanent failures (invalid payload/state/config), to avoid useless retries.
3. Event emission in functions:
   - Use `step.sendEvent()` from within workflow execution functions.
   - Do not use `inngest.send()` inside a running function.
4. Cancellation and wait behavior:
   - `cancelOn` cancels runs between steps; it does not interrupt a currently executing step.
   - `step.waitForEvent()` returns `null` on timeout; branch logic must explicitly handle timeout vs matched-event paths.
5. Idempotency:
   - For app-originated events, provide deterministic event IDs when duplicates are possible.
   - For in-function fanout/emits, rely on step memoization + `step.sendEvent()` durability and keep emitted payloads deterministic.
6. Limits to encode in validation and guardrails:
   - Step output: <= `4MB`
   - Function run state: <= `32MB`
   - Max steps per function: `1000`
   - Max events per send request: `5000`
   - Event payload limits vary by plan (design for compact payloads)
7. Flow control defaults for this rewrite:
   - Start without batching/debounce for execution function.
   - Add explicit concurrency controls only when we can key by tenant/workflow safely (to avoid noisy-neighbor issues).

Research sources (via Exa):
- https://www.inngest.com/docs/learn/how-functions-are-executed
- https://www.inngest.com/docs/learn/inngest-steps
- https://www.inngest.com/docs/reference/functions/step-run
- https://www.inngest.com/docs/features/inngest-functions/error-retries/retries
- https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors
- https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events
- https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
- https://www.inngest.com/docs/reference/functions/step-send-event
- https://www.inngest.com/docs/reference/events/send
- https://www.inngest.com/docs/usage-limits/inngest
- https://www.inngest.com/docs/guides/concurrency
- https://www.inngest.com/docs/guides/throttling

---

## 7. Reference Second-Pass Findings (notifications-workflow)

Goal of this section: keep copy parity as high as possible while explicitly defining the minimal intentional divergences.

## 7.1 High-Impact Mismatches Identified

1. Graph document shape mismatch:
   - Reference stores React Flow node/edge JSON with trigger/action config nested in node payloads.
   - Scheduling backend expects canonical typed workflow graph with top-level `trigger` and typed node kinds.
2. Trigger model mismatch:
   - Reference trigger model is `Webhook | Schedule`.
   - Scheduling target model is `domain_event | schedule`.
3. Integration model mismatch:
   - Reference editor/runtime is integration/plugin-centric.
   - Scheduling target is first-party workflow actions with no workflow-level integration dependency.
4. API contract mismatch:
   - Reference UI expects webhook-trigger-centric methods and payloads.
   - Scheduling backend uses draft/validate/publish/bind/run-draft with domain event dispatch.
5. UI baseline mismatch:
   - Scheduling app workflow pages are currently placeholder "removed" views.

## 7.2 Intentional Divergences (Locked)

1. Trigger semantics:
   - Replace reference `Webhook` trigger with `domain_event`.
   - Keep `schedule` trigger.
2. Canonical backend model:
   - Keep scheduling typed graph contract as persistence/runtime source of truth.
   - Do not reshape backend to raw reference graph payloads.
3. Workflow action coupling:
   - Remove `integrationKey` from workflow graph/catalog/compiler/runtime.
   - Keep Svix as a separate subsystem.

Everything else (editor UX, graph interactions, authoring flow, run visibility behavior) should be copied as closely as possible.

## 7.3 UI/API Compatibility Strategy

Use adapters, not backend compatibility shims.

1. Frontend graph adapter:
   - `referenceGraph -> canonicalGraph` before save/validate/publish.
   - `canonicalGraph -> referenceGraph` after load.
   - Trigger node exists in UI state only; backend keeps top-level canonical trigger.
2. Frontend API facade:
   - Provide reference-like client methods in admin UI layer.
   - Map internally to scheduling workflow routes/payloads.
3. Catalog adapter:
   - Transform backend trigger/action catalog into reference selector/config format.
   - Remove integration selectors and map to first-party action config fields.
4. Run status adapter:
   - Normalize backend statuses to reference UI status presentation.
   - Add backend status support only if reference parity requires it and adapter cannot represent it safely.

## 7.4 Contract-First Deliverables Before Porting UI

1. `Reference UI -> Backend DTO` field mapping table.
2. `Backend DTO -> Reference UI` field mapping table.
3. Trigger/action catalog mapping table.
4. Golden fixture tests for round-trip conversion (`A -> B -> A`) on:
   - domain-event start/restart/stop workflow
   - schedule workflow
   - condition + wait branching workflow

---

## 8. Detailed Implementation Phases

## Phase 0: Adapter Contract Freeze (Before Backend Refactor)

### Changes

1. Write explicit mapping specs for graph, trigger, and catalog transformations.
2. Add fixture-based round-trip adapter tests and freeze expected snapshots.
3. Confirm which reference UI behaviors require backend extension vs adapter-only mapping.

### Exit Criteria

- Mapping spec approved and checked in.
- Round-trip fixture tests passing.
- No unresolved shape ambiguity between copied UI and backend DTO.

## Phase A: DTO Contract Rewrite

### Files

- `packages/dto/src/schemas/workflow.ts`

### Changes

1. Remove `integrationKey` from:
   - `workflowActionNodeSchema`
   - `workflowActionCatalogItemSchema`
2. Remove/replace validation issue code dependency on integration mismatch semantics:
   - Keep `MISSING_INTEGRATION` only if still used for unknown action semantic (or rename usages to a more accurate code where needed in compiler).
3. Regenerate TypeScript inference impacts across exported types.

### Exit Criteria

- DTO compiles cleanly.
- No downstream compile errors for removed fields remain unresolved.

---

## Phase B: Action Registry Rewrite (First-Party Only)

### Files

- `apps/api/src/services/workflows/registry.ts`
- `apps/api/src/services/workflows/registry.test.ts`

### Changes

1. Remove integration-oriented action definitions (`resend/twilio/slack`) from workflow runtime catalog.
2. Add first-party actions:
   - `core.emitInternalEvent` (required)
   - Keep existing logical/system actions if represented elsewhere via graph kinds (`wait`, `condition`) and avoid duplicate semantics.
3. Remove `integrationKey` from:
   - `WorkflowActionDefinition` type
   - `executeWorkflowAction` input and mismatch validation
4. Keep trigger registry as-is for `domain_event` and `schedule`.

### Exit Criteria

- Registry tests updated and passing.
- `executeWorkflowAction` validates input and executes without integration context.

---

## Phase C: Compiler Rewrite

### Files

- `apps/api/src/services/workflows/compiler.ts`
- `apps/api/src/services/workflows/compiler.test.ts`

### Changes

1. Remove integration mismatch validation branch.
2. Keep action existence and input schema validation.
3. Preserve deterministic compiled plan behavior.
4. Keep cycle/unreachable/edge validation unchanged unless contract updates require tweaks.

### Exit Criteria

- Compiler tests updated and passing with no `integrationKey`.
- Compiled plans emitted without integration fields.

---

## Phase D: Runtime Rewrite (Inngest Execution Function)

### Files

- `apps/api/src/inngest/functions/workflow-execution.ts`
- `apps/api/src/inngest/functions/workflow-execution.test.ts`

### Changes

1. Remove runtime resolution of `integrationKey` from nodes.
2. Update action execution call to pass:
   - `actionId`
   - `rawInput`
   - `context`
3. Keep condition/wait/branch logic intact.
4. Ensure delivery logging still works with returned action metadata.
5. Keep retry/replacement/debounce logic unchanged unless required by new action contract.

### Inngest Best-Practice Checkpoint

Before finalizing this phase, validate implementation choices against current Inngest docs/best practices (using `exa`-based lookup when available; otherwise official Inngest docs directly):

- deterministic step IDs
- retry/backoff handling
- event idempotency strategy
- cancelOn/waitForEvent usage

### Exit Criteria

- Runtime tests pass.
- No integration-specific assumptions remain in execution path.

---

## Phase E: API Route Contract Alignment

### Files

- `apps/api/src/routes/workflows.ts`
- `apps/api/src/routes/workflows.test.ts`

### Changes

1. Update catalog output mapping to new action shape (no `integrationKey`).
2. Confirm publish/validate flows operate with integration-free graph.
3. Ensure run/cancel/steps APIs are unaffected by integration removal.

### Exit Criteria

- Workflow route tests pass.
- Catalog contract matches updated DTO schemas.

---

## Phase F: Cleanup and Consistency

### Files (search-driven)

- `apps/api/src/services/workflows/**`
- `apps/api/src/inngest/functions/**`
- `packages/dto/src/schemas/**`

### Changes

1. Remove stale comments/constants/error messages referring to integration requirements in workflow engine.
2. Ensure naming consistently reflects first-party action model.
3. Remove dead imports and unreachable code.

### Exit Criteria

- `pnpm lint` clean for touched areas.
- No residual `integrationKey` references in workflow engine path.

---

## 9. Testing Plan (Execution Order)

1. Targeted unit tests while refactoring:
   - `pnpm --filter @scheduling/api run test -- workflow registry/compiler/runtime`
2. Adapter fixture tests:
   - round-trip graph conversion (`reference -> canonical -> reference`)
   - catalog mapping (trigger/action forms)
3. Route tests:
   - `pnpm --filter @scheduling/api run test -- workflows`
4. Full API package tests:
   - `pnpm --filter @scheduling/api run test`
5. Monorepo typecheck:
   - `pnpm typecheck`

If failures surface in unrelated legacy integration modules, isolate and fix only where rewrite caused interface breakage.

---

## 10. Acceptance Criteria

1. Workflow graph DTO has no `integrationKey` requirement.
2. Workflow registry/runtime executes actions without integration dependencies.
3. Compiler validates action existence/input only (no integration mismatch checks).
4. Workflow catalog API returns action definitions without integration metadata.
5. Workflow run lifecycle tests pass (start, status, logs, cancel).
6. Svix subsystem behavior remains unchanged.
7. Reference-compatible UI adapter exists with fixture-tested round-trip mapping.
8. Trigger difference is only `Webhook -> domain_event`; schedule remains functionally equivalent.

---

## 11. Risks and Mitigations

## Risk: Hidden coupling to old integration actions in tests or runtime

- Mitigation: global search for `integrationKey`, `MISSING_INTEGRATION`, old action IDs.

## Risk: Frontend expectations diverge from updated catalog shape

- Mitigation: document catalog change now; frontend port will target new backend contract.

## Risk: Runtime side-effect semantics become too abstract

- Mitigation: define strict event intent payload schema for `core.emitInternalEvent` in registry input schema and tests.

## Risk: Inngest behavior regressions

- Mitigation: add explicit regression tests around retries, cancel, and guard-block behavior.

## Risk: UI copy drifts because of adapter edge cases

- Mitigation: freeze mapping tables and fixture snapshots before UI port; require parity checks for any adapter change.

---

## 12. Deliverables

1. Updated DTO schemas/types for integration-free workflow graph.
2. Rewritten workflow action registry with `core.emitInternalEvent`.
3. Compiler/runtime/route updates and passing tests.
4. This `PLAN.md` as implementation baseline for backend-first work.
5. Checked-in mapping spec + adapter fixture suite for reference UI compatibility.

---

## 13. Implementation Start Checklist

- [ ] Confirm current branch is clean
- [ ] Complete Phase 0 (adapter contract freeze)
- [ ] Complete Phase A (DTO)
- [ ] Complete Phase B (registry)
- [ ] Complete Phase C (compiler)
- [ ] Complete Phase D (runtime + Inngest best-practice verification)
- [ ] Complete Phase E (routes)
- [ ] Complete Phase F (cleanup)
- [ ] Run full API tests + root typecheck
