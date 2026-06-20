# Journey Engine on Inngest — Design Rationale

Status: proposal / decision doc
Scope: replace the hand-rolled durable-execution layer in the journey engine with Inngest's native durable primitives, by modeling a journey run as a single Inngest function.

## Why this document exists

The current engine builds a durable workflow runner by hand: delivery rows, a reconcile diff, deterministic keys, and per-delivery worker functions. An earlier rebuild proposal kept that shape and swapped the rows for a compiled state machine with a command buffer, an outbox, and a host step-loop. Both treat Inngest as a timer that fires `RESUME` / `scheduleResume` events back at our own machinery.

This document argues the opposite: Inngest is already a durable-execution engine. It provides durable sleep, wait-for-event, step memoization (exactly-once side effects), automatic retries, and declarative cancellation. We should model a journey run **as an Inngest function** and use those primitives directly, instead of building a second durable runtime on top of the one we already pay for.

## The durability we keep re-implementing

Every hard problem in the current engine is a durability problem Inngest already solves:

| Problem we hand-roll today | Inngest primitive |
| --- | --- |
| `journey_deliveries` rows + `reconcileDeliveries` diff + `buildDeliveryDeterministicKey` to schedule and de-dupe work | `step.run(id, fn)` — memoized, exactly-once per step id, survives retries |
| `wait-resume` delivery rows that fire an event and re-plan from a boundary | `step.sleepUntil(id, date)` — durable sleep that survives a crashed worker |
| `wait-for-confirmation-timeout` delivery + the 130-line `appointment.confirmed` special case in the planner | `step.waitForEvent(id, { event, timeout, if })` — wait for the confirmation or time out, in one call |
| Manual delivery cancellation on `appointment.canceled`, plus the worker's pre-dispatch cancellation re-check | function `cancelOn: [{ event: "appointment.canceled", if }]` |
| `journey-run-status.ts` inferring run status from the multiset of delivery statuses | the Inngest run's own status (running / completed / cancelled / failed) |
| The orphan window (commit row, then dispatch event — crash in between drops the send) and the resume-retry double-send | gone: there are no rows to dispatch and no second key to churn; a step either ran (memoized) or it didn't |

The recurring fixes I have been chasing — deterministic keys, re-dispatch-on-reconcile, dedup windows — are all attempts to give our delivery rows the at-least-once-with-memoization semantics that `step.run` has out of the box.

## The shape: a run is a function that walks the graph

A journey run is one Inngest function invocation. It loads the pinned graph snapshot and walks it from the trigger, calling a step primitive per node. Branching is ordinary control flow; the graph is a rooted tree (the DTO validator already guarantees exactly one trigger and one incoming edge per node), so each node is visited once and its node id is a stable, unique step id.

```ts
// sketch — one Inngest function per journey version
inngest.createFunction(
  {
    id: "journey-run",
    // one run per (journey version, entity, mode); a duplicate trigger no-ops
    idempotency: "event.data.journeyVersionId + ':' + event.data.entityId + ':' + event.data.mode",
    cancelOn: [
      { event: "appointment.canceled", if: "async.data.appointmentId == event.data.appointmentId" },
    ],
  },
  { triggers: [startEvent] },
  async ({ event, step }) => {
    const graph = event.data.graphSnapshot; // pinned at run start
    let node = scheduledSuccessorOf(triggerOf(graph));

    while (node) {
      switch (kindOf(node)) {
        case "wait": {
          const at = resolveWaitUntil(node, ctx);
          await step.sleepUntil(`wait:${node.id}`, at); // durable
          node = next(node);
          break;
        }
        case "wait-for-confirmation": {
          const confirmed = await step.waitForEvent(`confirm:${node.id}`, {
            event: "appointment.confirmed",
            timeout: resolveGrace(node, ctx),
            if: `async.data.appointmentId == "${ctx.appointmentId}"`,
          });
          node = confirmed ? confirmedBranch(node) : timeoutBranch(node);
          break;
        }
        case "condition": {
          const matched = evaluateCondition(node, ctx); // deterministic, pure
          node = matched ? trueBranch(node) : falseBranch(node);
          break;
        }
        case "send-resend":
        case "send-slack":
        case "send-twilio": {
          await step.run(`send:${node.id}`, () => dispatch(node, ctx)); // exactly-once
          node = next(node);
          break;
        }
        default:
          node = next(node);
      }
    }
  },
);
```

`restart` (`appointment.rescheduled`) is the one case that needs a decision rather than a primitive: cancel the in-flight run (`cancelOn` rescheduled) and let the rescheduled event start a fresh run with new data, or race a `step.waitForEvent("rescheduled")` at each wait boundary. Cancel-and-restart is the simpler default and matches today's "re-plan from the trigger" behavior.

## What this deletes

- `journey-run-status.ts` — status is the Inngest run status; "status drifted from the rows" stops being representable.
- `reconcileDeliveries`, `buildDesiredDeliveries`'s scheduling half, `buildDeliveryDeterministicKey`, and the wait-resume / confirmation-timeout delivery machinery in `journey-planner.ts`.
- The `appointment.confirmed` inline special case and `findPlannedConfirmationTimeoutByJourneyTx`.
- The worker's cancellation re-check, stale-key check, and the per-delivery dispatch function — sends are steps inside the run function.
- The orphan and resume-retry exactly-once problems, and the deterministic-key/`DeliveryKey` work, which only existed to emulate `step.run`.

`journey_deliveries` does not have to disappear — it becomes a *projection* (an audit/observability row written inside each send step), not the scheduling substrate. Run events and step logs stay for the builder overlay.

## Inngest as the runtime, not a timer

The alternative is a hand-built engine that treats Inngest as a timer: a compiled state machine plus a host loop that persists snapshots, drains a command buffer, and needs an outbox row written in the same transaction as the snapshot to get at-least-once delivery. That outbox is `step.run` re-implemented.

This doc treats Inngest as the runtime. There is no snapshot persistence, no command buffer, and no outbox; the function's position in its own step log *is* the run state, and `step.run` *is* the outbox-with-exactly-once.

A hand-built engine buys portability: an orchestration core you could lift into another app. This optimizes for the smallest correct system in *this* app, by not rebuilding what Inngest already guarantees. If portability becomes a real requirement we can revisit; "assume Inngest operates as expected" says it is not the priority today.

## Honest caveats

- **The run is coupled to Inngest.** That is the trade for deleting the durable layer. The dispatch adapters (Resend/Slack/Twilio) and CEL stay swappable; the orchestration does not.
- **Step ids must be deterministic and stable across retries.** Keying on node id is safe because the graph is a rooted tree with no re-convergence. If joins/parallel branches are ever added, step ids need a visit-path suffix, and parallel branches map to `Promise.all` of steps.
- **The builder run-overlay** reads run state. Today it infers from delivery rows; here it reads either the step logs we still write or the Inngest run timeline directly (`inngest-runs.ts` already wraps the Inngest REST API for run inspection — it exists for exactly this).
- **Versioning:** the run pins the graph snapshot at start (as it does today), so a republish mid-run does not move an in-flight run.
- **Long sleeps** rely on Inngest's durable sleep, which is the supported path for multi-day waits; this is squarely what `step.sleepUntil` is for.

## Migration path

1. Vertical slice: implement the run function for the appointment-reminder flow (trigger → condition → wait → send → wait-for-confirmation → send), behind the existing trigger entry point, for a single journey. Prove it end to end against a seeded appointment, including a mid-wait crash/replay and an `appointment.confirmed` race.
2. Project the run into the existing step-log/run-event tables so the builder overlay and run view keep working unchanged.
3. Move the remaining action types over, then delete `journey-run-status.ts`, the reconcile/deterministic-key machinery, and the wait/confirmation delivery handling.
4. Keep CRUD/publish/versioning (`journeys.ts`), the trigger filter evaluator, the provider registry, and templating — they are orthogonal to how a run advances.
