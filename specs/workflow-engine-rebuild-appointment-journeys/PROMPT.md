# Objective

Implement the appointment journey engine rebuild defined in `specs/workflow-engine-rebuild-appointment-journeys/`.

Replace the legacy generic workflow graph runtime with an appointment-only, linear journey system.

# Scope Reference

- Specs root: `specs/workflow-engine-rebuild-appointment-journeys/`
- Use as primary sources:
  - `design.md`
  - `plan.md`
  - `requirements.md`
  - `research/recommendations.md`

# Key Requirements

1. Appointment lifecycle taxonomy must be only:
   - `appointment.scheduled`
   - `appointment.rescheduled`
   - `appointment.canceled`
2. Journey step set must be exactly: Trigger, Wait, Send Message, Logger.
3. Non-linear structures must be rejected by API validation.
4. Trigger filters must use structured AST with one-level nesting and cap limits.
5. Backend filter evaluation should use constrained `cel-js` (no raw expression UI authoring).
6. Runtime must use planner + delivery worker (Inngest), with deterministic delivery identity.
7. Pause must cancel/suppress unsent deliveries; resume must immediately re-plan from current appointment state.
8. Runs must be version-pinned; journey delete must hard-delete definitions while preserving run history snapshots.
9. Test mode must support real execution with explicit `test|live` run separation and required Email override.
10. Overlap detection must be publish-time warning only (no publish block).
11. Message limits are out of scope for this rebuild.

# Constraints

- Big-bang replacement: do not preserve legacy workflow behavior.
- Follow repo policy: do not create incremental DB migrations; update initial migration artifacts.
- Keep webhooks functional with updated appointment taxonomy.
- Remove dead legacy runtime code after replacement.

# Acceptance Criteria (Given-When-Then)

1. Given a valid linear journey payload, when create is called, then it persists successfully in draft state.
2. Given a non-linear payload, when create or update is called, then API returns validation error and persists nothing.
3. Given appointment create, when classifier runs, then emitted event is `appointment.scheduled`.
4. Given appointment reschedule change (time/timezone), when classifier runs, then emitted event is `appointment.rescheduled`.
5. Given appointment canceled, when classifier runs, then emitted event is `appointment.canceled`.
6. Given a matching published journey, when planner processes scheduled event, then run and deliveries are planned.
7. Given reschedule causes mismatch, when planner re-evaluates, then pending unsent deliveries are canceled.
8. Given paused journey, when pause is applied, then pending unsent deliveries are canceled/suppressed.
9. Given paused journey resumed, when resume is applied, then active runs are immediately re-planned.
10. Given journey republished, when old run continues, then run remains pinned to original version.
11. Given journey deleted with active runs, when delete executes, then active runs are canceled and definition is hard-deleted.
12. Given deleted journey history, when querying runs, then historical runs remain visible with version snapshot context.
13. Given test-mode run with Email step and no override, when run starts, then start is rejected with clear error.
14. Given test-mode run with Slack step and no Slack override, when run starts, then run proceeds.
15. Given overlapping journey triggers, when publish runs, then warnings appear and publish still succeeds.

# Delivery Plan

Implement in incremental slices aligned to `plan.md` checklist, prioritizing:

1. taxonomy and contracts
2. schema and service layer
3. planner and worker runtime
4. UI builder and runs adaptation
5. overlap warnings and cleanup

# Quality Gates

Before completion, all must pass:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
