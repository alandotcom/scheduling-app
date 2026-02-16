# Design Doc: Entity-Scoped Correlated Automations

## Overview

We are building an automation builder and runtime on top of Inngest for a scheduling product. Automations are long-running, event-driven workflows that must stay aligned with changing domain state (appointments rescheduled, canceled, availability changing frequently, etc.) without duplicating side effects (SMS/email/Slack).

This document defines:

* A unified trigger model that scales across domain models (appointments, clients, calendars, availability)
* Runtime semantics for correlation, re-entry, updates, exits, and waits
* Availability-specific handling for high-frequency change streams
* Guardrails to prevent common “wrong intent” workflows

---

## Goals

1. **One clear mental model across domains**

* “What does one run represent?” (scope)
* “When does it start?” (entry)
* “What happens when related data changes?” (change handling)
* “When does it end?” (exit)

2. **Correctness for scheduling use cases**

* Appointment reminders automatically reschedule when start time changes
* Runs cancel cleanly on cancel/delete
* Avoid duplicate notifications by default

3. **Make safe defaults easy**

* Hide developer plumbing (correlation paths) unless needed
* Provide guardrails and preview

4. **Implementable on Inngest**

* Deterministic routing of events to runs
* No long-lived sleeps required (optional)
* Idempotent node execution

---

## Non-goals

* Full BPMN or arbitrary multi-entity joins
* Arbitrary event correlation logic expressed as code in the UI
* Exactly-once delivery end-to-end across third-party providers (we provide idempotency and retries, not strict exactly-once guarantees)

---

## Terminology

* **Automation**: A published workflow definition (nodes, edges, trigger rules).
* **Run**: One executing instance of an automation for a specific scope key.
* **Scope**: The domain concept a run represents (Appointment, Client, Calendar, Slot, Window).
* **Scope key**: The identifier for the run (typically an entity ID, sometimes composite).
* **Entry rule**: Events that create or re-enter a run.
* **Change rule**: Events that update an existing run’s context and optionally reschedule pending waits.
* **Exit rule**: Events that cancel/end a run.
* **Re-entry policy**: What to do if an entry event happens and a run already exists for the scope key.
* **Wait**: A node that schedules continuation at a future time or after a duration.

---

## Product UX Model

Replace “Start/Restart/Stop events + correlation path” with:

### Trigger configuration

1. **Runs for (scope)**

* Select: Appointment | Client | Calendar | Availability slot | Availability window
* Key: default per scope (hidden), with “Advanced” override

2. **Starts when (entry)**

* List of event types that start a run
* Each entry event defines how to extract the scope key (defaulted when possible)

3. **If a run already exists (re-entry policy)**

* Continue existing run
* Replace existing run (cancel and start fresh)
* Allow multiple runs (advanced)

4. **When data changes (change handling)**

* Update run data for future steps (default)
* Reschedule dependent waits (default for time-based scopes like Appointment)
* Restart from beginning (advanced)
* Ignore changes

Optional: **Stabilize changes** (debounce/coalesce), default on for availability-type triggers

5. **Ends when (exit)**

* List of event types that end a run
* Each exit event correlates to the same scope key mapping

### Wait node configuration

Support two user-facing modes:

* **Wait for**: duration (10 minutes, 1 day)
* **Wait until**: absolute or relative to scope data (1 hour before appointment start)

For “relative to scope” waits, show:

* “If the underlying time changes, reschedule automatically” (default)
* Advanced: keep original schedule, cancel run

---

## Configuration Schema

### Automation definition

```json
{
  "id": "aut_123",
  "version": 7,
  "status": "published",
  "scope": {
    "entity": "appointment",
    "key": {
      "type": "path",
      "path": "data.appointmentId"
    }
  },
  "entry": {
    "events": [
      { "name": "appointment.created", "keyPath": "data.appointmentId" }
    ],
    "reentryPolicy": "replace"
  },
  "changes": {
    "events": [
      { "name": "appointment.updated", "keyPath": "data.appointmentId" }
    ],
    "behavior": "update_and_reschedule_dependent_waits",
    "stabilize": null
  },
  "exit": {
    "events": [
      { "name": "appointment.canceled", "keyPath": "data.appointmentId" },
      { "name": "appointment.deleted", "keyPath": "data.appointmentId" }
    ]
  },
  "graph": {
    "nodes": [ /* nodes */ ],
    "edges": [ /* edges */ ]
  }
}
```

### Cross-domain entry example (Client scope started by Appointment event)

```json
{
  "scope": { "entity": "client", "key": { "type": "path", "path": "data.clientId" } },
  "entry": {
    "events": [
      { "name": "appointment.created", "keyPath": "data.clientId" }
    ],
    "reentryPolicy": "continue"
  }
}
```

### Wait node schema (dependency-aware)

```json
{
  "id": "node_wait_1",
  "type": "wait",
  "wait": {
    "mode": "until",
    "expression": {
      "type": "relative_to_scope",
      "basePath": "scope.startAt",
      "offsetSeconds": -3600
    },
    "dependencies": ["scope.startAt", "scope.timezone"],
    "onDependencyChange": "reschedule"
  }
}
```

Notes:

* `dependencies` is stored explicitly to avoid re-parsing expressions at runtime.
* `scope.*` is a normalized view of the entity snapshot stored on the run.

---

## Runtime Semantics

### Run identity and uniqueness

Default uniqueness key:

* `runKey = automationId + ":" + version + ":" + scopeKey`

If “Allow multiple runs” is enabled:

* `runKey = automationId + ":" + version + ":" + scopeKey + ":" + entryEventId` (or a configured discriminator)

### Event routing pipeline

All domain events flow through a router:

1. Find automations subscribed to this event name (entry, changes, or exit).
2. For each automation:

   * Compute `scopeKey` from `keyPath` on the matching rule
   * Load active run by `runKey` (or list if multiple allowed)
   * Apply the appropriate rule behavior

### Entry behavior

If no run exists:

* Create run
* Initialize `run.scopeSnapshot` from event payload (and optionally fetch latest entity snapshot)
* Enqueue execution at start node

If run exists:

* Apply `reentryPolicy`:

  * **continue**: no-op (optionally update run snapshot)
  * **replace**: cancel run and timers, then create new run and start
  * **allow_multiple**: create additional run instance

### Change behavior

If run exists:

* Merge new scope data into `run.scopeSnapshot`
* Apply `changes.behavior`:

  * `update_only`: update snapshot only
  * `update_and_reschedule_dependent_waits`: update snapshot and reschedule any pending waits whose dependencies intersect the changed data (see below)
  * `restart_from_beginning`: cancel pending timers, reset run state to start node, re-execute (guardrails required)

If no run exists:

* Default: ignore
* Optional future: “create on change” for some scopes (not in scope now)

### Exit behavior

If run exists:

* Mark run as canceled
* Cancel pending timers
* Do not execute further nodes

If no run exists:

* no-op

---

## Wait Execution Model

### Requirement

Waits must be cancelable and reschedulable without re-running completed nodes.

### Implementation approach

Use “resume events” instead of long sleeps:

* When execution hits a Wait node:

  1. Compute `dueAt` timestamp
  2. Persist a `RunTimer` record: `(runId, nodeId, dueAt, dependencies, status=pending)`
  3. Schedule an internal event `automation.resume` for `dueAt` with `{ runId, nodeId, timerId }`

* When `automation.resume` arrives:

  1. Load timer and run
  2. If run canceled or timer not pending, no-op
  3. Mark timer as fired
  4. Continue execution from the node following the Wait

Cancellation/reschedule:

* Canceling a run marks all pending timers canceled.
* Rescheduling updates `dueAt`, invalidates prior scheduled resume by canceling timer or incrementing a `timerRevision`.

  * Resume handler must verify `timerRevision` to avoid executing stale resumes.

### Dependency intersection

To reschedule waits on changes, we need to know if a Wait depends on fields that might have changed.

Data:

* Each wait stores `dependencies: [ "scope.startAt", ... ]`

When a change event arrives:

* Determine `changedPaths` for the scope snapshot.

  * If domain events include `changedPaths`, use them.
  * Else diff previous and new snapshots (shallow or path-based diff for known fields).
* For each pending timer:

  * If `intersects(timer.dependencies, changedPaths)` then recompute `dueAt` and reschedule.

Defaults:

* Appointment scope: `update_and_reschedule_dependent_waits`
* Client scope: `update_only`
* Availability scope: depends, see below

---

## Availability Handling

Availability updates are typically high-frequency and noisy. Raw `availability.updated` is not a good trigger surface.

### Derived event layer

Add an internal processor that converts raw updates into meaningful edge events:

Input:

* `availability.updated` (or equivalent), containing calendarId, appointmentTypeId (optional), and availability representation for a window.

Processor responsibilities:

1. Maintain last known snapshot per `{calendarId, appointmentTypeId, window}`.
2. Compute diffs to identify:

   * `availability.slot_opened`
   * `availability.slot_closed`
   * `availability.working_hours_changed` (optional)
   * `availability.block_created` / `availability.block_removed` (optional)
3. Emit derived events with stable identifiers:

   * slot key: `calendarId + startAt + duration (+ appointmentTypeId)`
4. Optionally emit `availability.stabilized` after a debounce window.

### Stabilize (debounce/coalesce)

For availability-based automations, expose trigger-level stabilization:

* Default: on, 2 minutes
* Semantics: only run after changes stop for N minutes
* Implementation: schedule a debounce timer keyed by `{calendarId, appointmentTypeId, window}`. Reset on each update. On fire, emit `availability.stabilized`.

### Availability scope options

Support two scopes explicitly in UI:

1. **Availability slot**

* Starts when: slot opened
* Ends when: slot closed
* Re-entry: replace (default)
* Changes: typically ignore or update only (slot is mostly identity + time)

2. **Calendar availability window**

* Starts when: availability stabilized
* Re-entry: replace or keep latest only
* Changes: replace pending execution (cancel in-flight run and restart) is acceptable because the workflow is usually compute-and-send, not a journey

Guardrail:

* If user selects raw `availability.updated` without stabilization, warn and require explicit acknowledgment.

---

## Idempotency and Side-Effect Safety

### Node execution idempotency

For every node execution, compute:

* `executionKey = runId + ":" + nodeId + ":" + attempt`

Persist execution outcome:

* `RunStepExecutions` table with status, timestamps, provider response metadata.

On retries or duplicate resume events:

* If an execution with the same key succeeded, skip re-sending.

### Notification-level “send once” defaults

For Twilio/Email/Slack nodes, default behavior:

* “Send at most once per run” using `executionKey`

Optionally (future):

* “Send at most once per scope” using:

  * `dedupeKey = automationId + ":" + scopeKey + ":" + nodeId`

---

## Guardrails and Validation

Implement a linter at publish time and inline warnings in the builder.

### Required validations

1. **Missing exit for cancelable scopes**

* If scope is Appointment and the graph contains any Wait, require an exit rule including canceled/deleted (or explicit override).

2. **High-risk restart**

* If change behavior is “restart_from_beginning” and the path before the first Wait includes side-effect nodes, warn: “May duplicate sends on updates.”

3. **Availability noise**

* If trigger includes `availability.updated` and stabilize is off, warn and require explicit confirmation.

4. **Unbounded waits**

* If Wait until time is in the past or uncomputable based on available data, fail execution and log.

### Suggested preview feature (implementation can be phased)

Timeline preview:

* Given a sample scope snapshot, show scheduled times for each Wait-derived action.
* Simulate an update event (change startAt) and show what reschedules.

---

## Data Model

Minimum tables:

### Automations

* `id`, `version`, `status`, `name`
* `scopeEntity`
* `definitionJson`
* `createdAt`, `updatedAt`

### AutomationSubscriptions

* `automationId`, `version`
* `eventName`
* `ruleType`: entry | change | exit
* `keyPath`
* Optional: `stabilizeSeconds` (for change rules, availability)

### Runs

* `id`
* `automationId`, `version`
* `scopeKey`
* `status`: active | canceled | completed | failed
* `scopeSnapshotJson`
* `currentNodeId`
* `startedAt`, `updatedAt`, `endedAt`

### RunTimers

* `id`
* `runId`
* `nodeId`
* `dueAt`
* `dependenciesJson`
* `status`: pending | fired | canceled
* `revision` (integer)

### RunStepExecutions

* `id`
* `runId`, `nodeId`
* `executionKey` (unique)
* `status`: started | succeeded | failed
* `providerMetadataJson`
* `createdAt`, `updatedAt`

---

## Inngest Integration Notes

### Event ingestion

* Domain services emit events to Inngest with consistent envelopes:

  * `name`
  * `data`
  * Optional: `changedPaths` for update events
  * Optional: `eventId` for dedupe

### Router function

Create one Inngest function (or small set) responsible for:

* receiving all domain events relevant to automations
* loading matching `AutomationSubscriptions`
* applying entry/change/exit logic
* enqueueing internal execution events:

  * `automation.execute` (start or continue)
  * `automation.resume` (timer fired)
  * `automation.cancel` (optional internal event)

### Execution function

A separate Inngest function processes `automation.execute` and `automation.resume`:

* Loads run
* Executes nodes deterministically until:

  * a Wait node schedules a timer and returns
  * workflow completes
  * failure occurs (apply retry policy per node)

### Concurrency

Enforce per-run serialization using:

* Application-level locking on `runId`, or
* Inngest concurrency key based on `runId`

Also enforce uniqueness on `runKey` at the database layer.

---

## Defaults by Scope

### Appointment

* Entry: appointment.created
* Re-entry: replace
* Change: update and reschedule dependent waits
* Exit: appointment.canceled, appointment.deleted

### Client

* Entry: client.created (common), plus optional cross-domain entry (appointment.created keyed by clientId)
* Re-entry: continue
* Change: update only
* Exit: client.deleted, client.unsubscribed (if applicable)

### Calendar object

* Entry: calendar.connected/created
* Re-entry: replace or continue (product choice)
* Change: update only
* Exit: calendar.disconnected/deleted

### Availability slot

* Entry: availability.slot_opened
* Re-entry: replace
* Exit: availability.slot_closed
* Stabilize: not needed (events are edge-based)

### Availability window

* Entry: availability.stabilized
* Re-entry: replace
* Change: replace pending run or keep latest only
* Stabilize: required, default on

---

## Implementation Plan

Phase 1: Core model and runtime

* Schema changes: Automations, Subscriptions, Runs, Timers, StepExecutions
* Router + executor functions
* Trigger UI updated to Scope, Entry, Re-entry, Changes, Exit
* Wait node dependency storage and timer scheduling
* Appointment defaults and guardrails

Phase 2: Availability derived events

* Availability diff processor + derived events
* Stabilize support
* Availability scope options in UI

Phase 3: Preview and advanced guardrails

* Timeline preview
* Additional lint rules, duplicate-send detection heuristics

---
