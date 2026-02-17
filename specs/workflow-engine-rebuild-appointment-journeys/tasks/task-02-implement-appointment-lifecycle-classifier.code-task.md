---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Implement Appointment Lifecycle Classifier

## Description
Implement a centralized appointment lifecycle classifier in mutation paths so appointment create, reschedule, and cancel transitions emit only canonical taxonomy events.

## Background
Appointment mutation code currently emits legacy patterns (`created|updated`). This task aligns runtime emission behavior with the new taxonomy contracts.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Classify create as `appointment.scheduled`, time/timezone changes as `appointment.rescheduled`, and cancel transition as `appointment.canceled`.
2. Ensure unrelated updates emit no lifecycle event.
3. Route all appointment mutation emission through one classifier helper to avoid divergent callsite behavior.
4. Provide a checkpoint by running appointment mutation/emitter tests demonstrating canonical event emission.

## Dependencies
- task-01-cutover-appointment-taxonomy-contracts.code-task.md

## Implementation Approach
1. Write failing tests for create/reschedule/cancel classifications and non-emitting unrelated updates.
2. Implement classifier logic and integrate it into appointment mutation paths.
3. Refactor emit callsites to use the shared helper while keeping tests green.

## Acceptance Criteria

1. **Create Emits Scheduled**
   - Given a new appointment creation
   - When classifier logic executes
   - Then `appointment.scheduled` is emitted.

2. **Reschedule and Cancel Emit Correct Types**
   - Given an existing appointment update
   - When time/timezone changes or cancellation transition occurs
   - Then classifier emits `appointment.rescheduled` or `appointment.canceled` respectively.

3. **Unrelated Updates Emit Nothing**
   - Given an appointment update unrelated to lifecycle transitions
   - When classifier logic executes
   - Then no lifecycle event is emitted.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running appointment service/emitter tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: api, appointments, classifier, events
- **Required Skills**: service-layer, unit-testing, eventing
