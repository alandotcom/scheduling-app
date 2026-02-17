# Appointment Journey Engine Rebuild Requirements

## Overview

This rebuild replaces the legacy generic workflow graph runtime with an appointment-only linear journey system.

Primary outcome:

- reduced configuration complexity with predictable, observable runtime behavior

## Detailed Requirements

### Scope and governance

R1. Journey automation is appointment-only in v1. The system removes generic graph runtime behavior and does not preserve branch-capable legacy semantics.

R2. Mutating journey operations are org-admin only (create, update, publish, pause, resume, duplicate, cancel runs, delete).

R3. Journey names are unique per org.

R4. Backfill enrollment is out of scope. New or republished journeys apply to future lifecycle events only.

### Canonical event taxonomy

R5. Canonical appointment lifecycle events are exactly:

- `appointment.scheduled`
- `appointment.rescheduled`
- `appointment.canceled`

R6. Appointment lifecycle classification rules are strict:

- create => `appointment.scheduled`
- time/timezone change while not canceled => `appointment.rescheduled`
- transition to canceled => `appointment.canceled`

R7. Legacy appointment event aliases are removed. Webhook catalog and emission surfaces expose only the canonical taxonomy.

### Journey definition model

R8. Allowed step types are exactly: Trigger, Wait, Send Message, Logger.

R9. Non-linear structures (branching, condition trees, graph edges outside linear sequencing) are invalid and must be rejected at API validation for create/update.

R10. Wait supports appointment start/end anchors, before/after direction, and parseable duration expressions. Time calculations always use current appointment date/time/timezone at evaluation time.

R11. Message channels in scope are Email and Slack. SMS delivery is out of scope for this rebuild.

R12. Send Message supports dynamic appointment/client variables using existing template placeholder syntax.

### Trigger filter semantics

R13. Trigger filters are represented as structured AST (canonical persisted format), not raw user-authored expressions.

R14. Filter logic supports AND/OR/NOT with one nesting level maximum.

R15. Filter caps are enforced: max 12 conditions total and max 4 groups.

R16. Filter operators include equality/inequality, membership, string operations, date/time comparisons, and null checks (`is set`, `is not set`).

R17. Filter fields include all appointment and client attributes.

R18. Backend filter evaluation uses constrained `cel-js` execution. Raw CEL authoring in UI is not allowed.

R19. Filter evaluation runs for `appointment.scheduled` and `appointment.rescheduled` events.

R20. Reschedule behavior:

- matched -> no longer matched: cancel pending unsent deliveries
- not matched -> matched: plan new deliveries from updated appointment timing
- matched -> matched: re-plan, cancel obsolete pending deliveries, create replacements
- recomputed send time in past: persist `skipped` with reason `past_due` (no catch-up send)

### Runtime and orchestration

R21. Runtime architecture is planner + delivery worker on Inngest.

R22. Planner is source of truth for desired delivery plan; worker is source of truth for actual send attempt execution.

R23. Delivery planning and execution use deterministic identity keys for idempotency (run identity and delivery identity).

R24. Delivery terminal statuses are `sent`, `failed`, `canceled`, `skipped`.

R25. Provider retry behavior is enabled with fixed provider defaults (no admin retry controls in v1). Resend idempotency keys are required.

### Journey lifecycle and retention

R26. Journey states are `draft`, `published`, `paused`, and `test_only`.

R27. Pause cancels/suppresses pending unsent deliveries for active runs.

R28. Resume immediately re-plans active runs from current appointment state/time.

R29. Appointment canceled or deleted is terminal for the run and cancels pending unsent deliveries.

R30. Runs are version-pinned to the journey version active at run start. Republishing does not migrate existing runs.

R31. Bulk cancel scope in v1 is "all active runs for a selected journey" (across versions), plus individual run cancel.

R32. Journey delete hard-deletes definitions, auto-cancels active runs, and preserves historical run visibility with version snapshot context.

R33. Run/delivery retention is indefinite for now.

### Test mode semantics

R34. Runtime mode is explicit and persisted: `live` vs `test`.

R35. `test_only` journeys auto-trigger from real appointment lifecycle events.

R36. Manual test start with explicit appointment selection remains supported.

R37. Auto-triggered and manual-started test executions both create `mode=test` runs only.

R38. Email override is required for test run start; if missing, run start is rejected and no send executes.

R39. Slack override is optional in v1.

R40. Test mode waits run exactly as configured (no acceleration path in v1).

R41. UI must prominently label test-only journeys and test-mode runs.

### Overlap warnings and observability

R42. Overlap detection is publish-time only.

R43. Overlap detection is best-effort heuristic and warning-only. Publish is never blocked by overlap warnings.

R44. Multiple journeys can run independently for the same appointment. No cross-journey send deduplication in v1.

R45. Logger step output appears in run timeline and is emitted to real logger/console.

### Explicit out-of-scope items

R46. Message limits/suppression-by-limit are out of scope for this rebuild.

R47. SMS delivery implementation is out of scope (future support may reuse test override semantics).

## Acceptance Criteria

1. Given a valid linear journey payload, when create is called, then it persists successfully in `draft` state.
2. Given a non-linear payload, when create or update is called, then API returns a validation error and persists nothing.
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

## Sources

- `specs/workflow-engine-rebuild-appointment-journeys/rough-idea.md`
- `specs/workflow-engine-rebuild-appointment-journeys/research/recommendations.md`
- consolidated Q&A history resolved through A68
