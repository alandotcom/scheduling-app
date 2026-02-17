---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Implement Appointment Lifecycle Classifier

## Description
Implement and centralize appointment lifecycle classification in mutation paths so appointment writes emit only canonical lifecycle events and no-op for unrelated updates.

## Background
Appointment service mutation paths currently emit older created/updated patterns. The rebuild requires deterministic classification for create, reschedule, and cancel transitions.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Creation path must classify and emit `appointment.scheduled`.
2. Time or timezone changes on non-canceled appointments must classify and emit `appointment.rescheduled`.
3. Transition to canceled state must classify and emit `appointment.canceled`, while unrelated updates emit nothing.

## Dependencies
- task-01-cutover-appointment-taxonomy-contracts.code-task.md

## Implementation Approach
1. Write failing classifier/emitter tests for create, reschedule, cancel, and unrelated updates.
2. Implement a shared classifier helper and wire it into appointment mutation paths.
3. Refactor callsites to remove legacy emission branches and keep tests green.

## Acceptance Criteria

1. **Create Emits Scheduled**
   - Given a new appointment is created
   - When lifecycle classification runs
   - Then `appointment.scheduled` is emitted.

2. **Reschedule Emits Rescheduled**
   - Given an existing appointment has start time or timezone changed
   - When lifecycle classification runs
   - Then `appointment.rescheduled` is emitted.

3. **Cancel Emits Canceled; Unrelated Updates Emit Nothing**
   - Given either a cancel transition or a non-lifecycle update
   - When lifecycle classification runs
   - Then cancel emits `appointment.canceled` and non-lifecycle updates emit no appointment lifecycle event.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: api, appointments, classifier, events
- **Required Skills**: testing, service-layer
