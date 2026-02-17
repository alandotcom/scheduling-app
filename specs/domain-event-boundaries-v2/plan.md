# Implementation Plan

## Checklist

- [ ] Step 1: Introduce journey-only trigger contract in DTO
- [ ] Step 2: Enforce appointment-only trigger contract in journey graph validation
- [ ] Step 3: Enforce hard API rejection for non-appointment journey triggers
- [ ] Step 4: Convert journey trigger UI to fixed appointment lifecycle UX
- [ ] Step 5: Align editor state/default graph behavior with fixed trigger model
- [ ] Step 6: Preserve integration/webhook multi-domain behavior and verify boundary split
- [ ] Step 7: Remove stale docs/references that imply generic journey triggers
- [ ] Step 8: End-to-end validation pass and fresh-start reset verification

## Step 1: Introduce journey-only trigger contract in DTO

Objective:
Establish a dedicated journey trigger schema/type that only permits appointment lifecycle events, independent from the global domain-event taxonomy.

Implementation guidance:
- Add/standardize a `JourneyEventType` union limited to `appointment.scheduled`, `appointment.rescheduled`, `appointment.canceled`.
- Define a journey trigger config schema with literal appointment domain and fixed start/restart/stop mappings.
- Keep existing global domain-event schemas unchanged for webhook/integration use.

Test requirements:
- Add DTO parse tests proving canonical journey trigger config passes.
- Add DTO parse tests proving non-appointment domains/events fail.

Integration notes:
- This step is contract-only and should not change runtime behavior yet.

Demo description:
Run DTO tests and show that journey trigger payload acceptance is now appointment-only at schema level.

## Step 2: Enforce appointment-only trigger contract in journey graph validation

Objective:
Ensure journey graph validation consumes the journey-specific trigger schema so invalid trigger configs cannot be represented as valid journeys.

Implementation guidance:
- Update journey graph validator to parse trigger-node config with journey-only trigger schema.
- Remove acceptance paths that rely on broad workflow domain-event trigger schema for journeys.
- Ensure validation errors are attributed to trigger node config paths.

Test requirements:
- Add/adjust graph validation tests for failing cross-domain trigger nodes.
- Keep existing topology/linear-graph constraints passing.

Integration notes:
- This step gates persistence via shared DTO parsing and protects all consumers.

Demo description:
Validate a sample journey graph with `domain: client` fails parse while canonical appointment graph succeeds.

## Step 3: Enforce hard API rejection for non-appointment journey triggers

Objective:
Guarantee journey create/update paths reject invalid trigger payloads and never persist cross-domain journey configs.

Implementation guidance:
- Wire route/service validation to updated journey schema output.
- Keep rejection behavior strict (no coercion, no fallback remapping).
- Return structured validation details for trigger-node failures.

Test requirements:
- Add API tests for create/update rejection of non-appointment trigger configs.
- Confirm valid appointment-only payloads still persist.

Integration notes:
- This closes server-side boundary even if stale clients submit old payloads.

Demo description:
Submit one invalid and one valid journey payload via route tests; invalid is rejected, valid is saved.

## Step 4: Convert journey trigger UI to fixed appointment lifecycle UX

Objective:
Make invalid trigger authoring impossible in the editor by replacing generic controls with fixed appointment lifecycle presentation.

Implementation guidance:
- Remove/hide domain selector in journey trigger panel.
- Remove editable start/restart/stop event selectors.
- Render fixed lifecycle mapping as read-only explanatory content.
- Keep trigger filters available as advanced optional section, collapsed by default.
- Remove editable correlation-path input from journey trigger UI.

Test requirements:
- Add/update UI tests asserting absence of generic trigger controls.
- Add/update UI tests asserting advanced filter section remains available/collapsed.

Integration notes:
- UI should emit journey trigger config shape compatible with Step 1 contract.

Demo description:
Open trigger panel and show users can no longer pick domain/event sets, but can still expand and edit filters.

## Step 5: Align editor state/default graph behavior with fixed trigger model

Objective:
Ensure all editor defaults, normalization, and serialization paths produce the new fixed journey trigger contract consistently.

Implementation guidance:
- Update default graph builders to emit fixed appointment trigger config.
- Remove store/sidebar assumptions that rely on global domain selector/event arrays for journeys.
- Keep safeguards that prevent malformed trigger node state from being persisted.

Test requirements:
- Update editor-store/sidebar tests for fixed trigger defaults and removed generic fields.
- Ensure save/serialize still works for valid journey graphs.

Integration notes:
- This step prevents reintroduction of invalid shape through local editor state.

Demo description:
Create a new journey in UI tests and verify serialized trigger config is canonical appointment-only by default.

## Step 6: Preserve integration/webhook multi-domain behavior and verify boundary split

Objective:
Confirm journey narrowing does not break integration/webhook flows that depend on full domain-event taxonomy.

Implementation guidance:
- Keep global event emitters/fanout registrations unchanged.
- Verify no accidental type narrowing leaks into integration fanout or webhook catalog code paths.
- Document explicit boundary: global events are broad; journey triggers are narrow.

Test requirements:
- Run/adjust integration fanout and event-emitter tests covering non-appointment event types.
- Ensure appointment journey runtime tests remain green.

Integration notes:
- This is the key non-regression guard for your stated requirement.

Demo description:
Show that non-appointment events still validate/process in integration/webhook tests while journey constraints remain appointment-only.

## Step 7: Remove stale docs/references that imply generic journey triggers

Objective:
Reduce implementation drift by aligning internal docs and guide references with the current journey model.

Implementation guidance:
- Update docs that still reference removed legacy workflow paths for journey trigger behavior.
- Add concise boundary statement in journey-related guide text.
- Keep docs focused on current journey runtime/editor naming.

Test requirements:
- Link-check/format checks for updated docs where applicable.

Integration notes:
- Documentation alignment supports future implementation cycles and avoids reintroducing obsolete assumptions.

Demo description:
Review updated docs showing appointment-only journey trigger contract and preserved global event usage for integrations/webhooks.

## Step 8: End-to-end validation pass and fresh-start reset verification

Objective:
Close with a clean, reproducible verification that invalid journey trigger configs cannot be authored/saved in the fresh-start dev environment.

Implementation guidance:
- Run formatting, lint, typecheck, and test gates.
- Recreate/reset local journey data if needed to ensure no stale cross-domain configs remain.
- Perform one smoke journey authoring flow that confirms fixed trigger UX and successful save.

Test requirements:
- Required quality suite passes (`format`, `lint`, `typecheck`, full `test` command set).
- Journey create/update negative/positive cases pass.

Integration notes:
- This step is the release-readiness gate for boundary enforcement.

Demo description:
Demonstrate from a clean state that journey editor only produces appointment-only triggers and API rejects any injected cross-domain payload.
