# Implementation Plan

## Checklist

- [ ] Step 1: Cut over appointment lifecycle event taxonomy
- [ ] Step 2: Implement appointment lifecycle emit classification
- [ ] Step 3: Introduce journey DTO contracts and route surfaces
- [ ] Step 4: Replace DB runtime model with journey entities
- [ ] Step 5: Implement journey repository and service lifecycle operations
- [ ] Step 6: Implement trigger filter AST validation and backend CEL evaluation
- [ ] Step 7: Build journey planner runtime
- [ ] Step 8: Build delivery worker runtime and channel dispatch
- [ ] Step 9: Implement test mode and safety override rules
- [ ] Step 10: Replace builder UI with linear journey authoring
- [ ] Step 11: Replace runs UI with journey run and delivery observability
- [ ] Step 12: Add publish-time overlap warnings and complete cutover cleanup
- [ ] Step 13: Execute full verification gates and release readiness checks

## Step 1: Cut over appointment lifecycle event taxonomy

Objective:

- Move canonical appointment event names to `appointment.scheduled`, `appointment.rescheduled`, and `appointment.canceled` with no legacy aliases.

Implementation guidance:

- Update DTO event catalogs and envelope unions for appointment event names.
- Keep non-appointment domains unchanged.
- Update webhook catalog grouping/description mapping and stale-event pruning behavior.

Test requirements:

- Add/adjust schema tests proving only new appointment lifecycle names are accepted.
- Add tests confirming legacy appointment aliases are rejected.
- Add tests for webhook catalog generation naming consistency.

Integration notes:

- This must land before runtime replacement to avoid mixed taxonomy.
- Preserve webhook feature behavior while changing names.

Demo description:

- Show schema validation output and webhook catalog sync results with only the new appointment names.

## Step 2: Implement appointment lifecycle emit classification

Objective:

- Ensure appointment operations emit only lifecycle-classified journey events.

Implementation guidance:

- Encode strict classification rules:
  - create -> scheduled
  - time or timezone change while not canceled -> rescheduled
  - status transition to canceled -> canceled
- Ignore unrelated mutations for journey triggering.

Test requirements:

- Add service tests for create, reschedule, cancel, and unrelated update paths.
- Add negative tests proving duplicate or incorrect lifecycle emissions do not occur.

Integration notes:

- Reuse current emitter infrastructure.
- Keep integration fanout compatibility for non-appointment events.

Demo description:

- Trigger representative appointment mutations and show emitted lifecycle event types.

## Step 3: Introduce journey DTO contracts and route surfaces

Objective:

- Replace graph-centric workflow contracts with appointment-journey contracts.

Implementation guidance:

- Add journey definition schema with linear steps only.
- Add journey state and mode fields (`draft`, `published`, `paused`, `test_only`; `live`, `test`).
- Add validation that rejects non-linear structures.
- Update route input/output contracts for journey CRUD and run operations.

Test requirements:

- Add DTO validation tests for accepted and rejected journey payloads.
- Add API contract tests for create, update, publish, pause, resume, delete inputs.

Integration notes:

- Preserve auth and admin-only mutation patterns from existing routes.

Demo description:

- Use API examples to create and retrieve a valid linear journey, and show non-linear payload rejection.

## Step 4: Replace DB runtime model with journey entities

Objective:

- Introduce journey-focused persistence for definitions, versions, runs, and deliveries.

Implementation guidance:

- Replace legacy workflow runtime tables with journey tables in the initial migration artifacts.
- Encode deterministic uniqueness constraints for run and delivery planning.
- Ensure hard-delete journey plus retained history behavior is possible via snapshot fields.
- Keep retention indefinite for now.

Test requirements:

- Add DB tests for constraints, foreign key behavior, and history retention after journey deletion.
- Add tests for deterministic uniqueness under duplicate planner inputs.

Integration notes:

- Follow repo rule: update initial migration artifacts only and reset/push dev DB.

Demo description:

- Show schema state and sample inserts proving version-pinned runs and retained history after journey delete.

## Step 5: Implement journey repository and service lifecycle operations

Objective:

- Deliver core lifecycle logic for journey management.

Implementation guidance:

- Implement service operations for create, update, publish, pause, resume, duplicate, delete.
- Implement bulk cancel all active runs for selected journey.
- Enforce unique journey name per org.
- Enforce version pinning semantics for existing runs.

Test requirements:

- Add repository and service tests for each lifecycle action.
- Add tests for delete behavior: auto-cancel active runs plus retained run history.
- Add auth tests for admin-only mutation access.

Integration notes:

- Wire route handlers to new service methods and remove old workflow graph assumptions.

Demo description:

- Walk through publish, pause, resume, and delete actions with expected data/state transitions.

## Step 6: Implement trigger filter AST validation and backend CEL evaluation

Objective:

- Support expressive yet controlled trigger filtering with simple UI structure and robust backend evaluation.

Implementation guidance:

- Define canonical structured filter AST with one-level nesting and caps.
- Validate operator compatibility by field type.
- Translate AST to constrained CEL evaluation input in backend.
- Evaluate against appointment and client attribute context.

Test requirements:

- Unit tests for AST schema validation and cap limits.
- Unit tests for AST-to-CEL translation correctness.
- Evaluation tests for AND/OR/NOT, null checks, and date/time comparisons.

Integration notes:

- Keep AST canonical in persistence for overlap warning analysis.
- Do not expose raw CEL expressions in UI.

Demo description:

- Run a filter test matrix showing expected match/non-match outcomes.

## Step 7: Build journey planner runtime

Objective:

- Plan and maintain desired future deliveries from lifecycle and journey-control inputs.

Implementation guidance:

- Implement planner Inngest function and supporting services.
- On scheduled and rescheduled events, evaluate trigger filters and compute deliveries.
- On mismatch and terminal events, cancel obsolete pending deliveries.
- Emit internal runtime events:
  - `journey.delivery.scheduled`
  - `journey.delivery.canceled`
- Mark past-due computed sends as `skipped` with reason `past_due`.

Test requirements:

- Integration tests for scheduled, rescheduled, canceled, and deleted appointment paths.
- Idempotency tests for duplicate lifecycle events.
- Tests for pause and resume immediate replanning interaction.

Integration notes:

- Planner is the source of truth for delivery planning state.

Demo description:

- Show planner outputs and delivery rows for schedule, reschedule, and cancel scenarios.

## Step 8: Build delivery worker runtime and channel dispatch

Objective:

- Execute due deliveries reliably with cancellation safety and provider-aware retries.

Implementation guidance:

- Implement worker function triggered by `journey.delivery.scheduled`.
- Sleep until due time and cancel by delivery identity on cancel event.
- Revalidate appointment and journey state before send.
- Dispatch via Email and Slack adapters.
- Apply provider retry defaults and Resend idempotency keys.
- Persist final statuses: `sent`, `failed`, `canceled`, `skipped`.

Test requirements:

- Worker tests for successful send, cancel race, past-due skip, and failure retry behavior.
- Channel adapter tests for success and failure persistence semantics.

Integration notes:

- Keep channel behavior aligned with existing integration config/secret patterns.

Demo description:

- Run an end-to-end scenario from planned delivery to persisted send outcome.

## Step 9: Implement test mode and safety override rules

Objective:

- Deliver full test execution mode with clear safety boundaries.

Implementation guidance:

- Add explicit run mode handling (`test` vs `live`) in planner/worker and storage.
- Implement `test_only` journey state with auto-trigger behavior.
- Enforce required Email override for test runs.
- Keep Slack override optional in v1.
- Keep waits unchanged in test mode.

Test requirements:

- Tests for required Email override validation failures.
- Tests confirming Slack runs without override in test mode.
- Tests verifying test mode labeling and separate query filtering.

Integration notes:

- Replace dry-run semantics with explicit mode semantics in service contracts.

Demo description:

- Start a test run on an existing appointment and show real action execution with `test` labeling.

## Step 10: Replace builder UI with linear journey authoring

Objective:

- Reduce configuration complexity with a v1-appropriate authoring surface.

Implementation guidance:

- Remove branch-related actions from action registry and editor behaviors.
- Implement trigger filter builder UI with one-level grouped logic.
- Keep step set to Trigger, Wait, Send Message, Logger only.
- Add journey state controls for draft, publish, pause, and test-only.

Test requirements:

- UI tests proving non-v1 step types cannot be added.
- UI tests for trigger filter authoring, caps, and validation feedback.
- UI tests for state transitions and save/publish controls.

Integration notes:

- Align editor payload exactly to new DTO contracts.

Demo description:

- Build and publish a valid journey using the new UI and show rejected invalid configurations.

## Step 11: Replace runs UI with journey run and delivery observability

Objective:

- Provide clear run visibility for live and test executions.

Implementation guidance:

- Update runs panels and detail views for journey run/delivery contracts.
- Add filters for journey state and run mode.
- Show clear test badges and status/reason visibility.
- Show logger step outputs in run timeline.

Test requirements:

- UI tests for status rendering and mode filters.
- UI tests for timeline data and logger output visibility.

Integration notes:

- Keep query patterns compatible with retained history for deleted journeys.

Demo description:

- Display live and test runs side by side with status details and timeline entries.

## Step 12: Add publish-time overlap warnings and complete cutover cleanup

Objective:

- Add warning-only overlap guidance and fully remove legacy runtime surfaces.

Implementation guidance:

- Implement publish-time heuristic overlap detection using structured filter AST.
- Return warnings with confidence labels and reasons.
- Do not block publish.
- Remove legacy workflow runtime functions/services/routes and stale UI assumptions.

Test requirements:

- Unit tests for overlap heuristic classifications and edge cases.
- API/UI tests proving warnings appear but publish succeeds.
- Tests ensuring no legacy runtime path is still used.

Integration notes:

- Keep webhook behavior independent from journey states.

Demo description:

- Publish overlapping journeys and show warnings without publish block.

## Step 13: Execute full verification gates and release readiness checks

Objective:

- Confirm production readiness for the rebuild in development pipeline terms.

Implementation guidance:

- Run full repo quality gates and fix all failures:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Execute acceptance matrix scenarios from design document.
- Validate webhook catalog contents and integration fanout behavior.

Test requirements:

- No failing tests or lint/type errors remain.
- Add missing regression tests for any issue found during gate runs.

Integration notes:

- This step is not complete until all gates pass with no suppressions.

Demo description:

- Present full test and quality gate results plus acceptance checklist completion.
