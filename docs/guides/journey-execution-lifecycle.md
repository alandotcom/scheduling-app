# Journey Execution Lifecycle

This guide defines the runtime contract for journey execution on the
Inngest-native engine. A journey **run is a single Inngest function** that walks
the pinned graph snapshot, calling one durable primitive per node. There is no
separate delivery scheduler, no status inference, and no internal wait-resume
events — those were replaced by Inngest's `step.run`, `step.sleepUntil`,
`step.waitForEvent`, and `cancelOn`.

## The two halves

- **Dispatcher** — `apps/api/src/services/journey-planner.ts`. Reacts to a domain
  event (`appointment.*` / `client.*`) via `processJourneyDomainEvent`: resolves
  which journeys it starts/restarts/stops, creates the run row, and emits one
  `journey.run.start` event per run. It does not schedule deliveries.
- **Run function** — `apps/api/src/inngest/functions/journey-run.ts` →
  `apps/api/src/services/journey-run-executor.ts` (`executeJourneyRun`). Triggers
  on `journey.run.start`, walks the graph, and projects progress into the overlay
  tables.

## Runtime Artifacts

- `journey_runs` — one row per run; its `status` is set by the run function.
- `journey_run_step_logs` — per-node progress (the overlay timeline).
- `journey_run_events` — append-only run-event stream.
- `journey_deliveries` — an **observability projection** written inside each send
  step (it is not a scheduling substrate).

Schema source: `packages/db/src/schema/index.ts`.

## Run Identity and Correlation

Runs are correlated by trigger entity and mode:

- `trigger_entity_type`: `appointment` or `client`
- `trigger_entity_id`: source entity id
- `mode`: `live` or `test`

Uniqueness is a **partial** unique index over active runs only:

- `(org_id, journey_version_id, trigger_entity_type, trigger_entity_id, mode)`
  `WHERE status IN ('planned','running')`

At most one active run holds an identity; terminal runs (completed/canceled/
failed) do not occupy the slot, which is what lets cancel-and-restart and
terminal-branch runs create a fresh active run after the prior one finishes.

## Run Status Lifecycle

The run function owns status directly — it is never inferred from delivery rows:

- created by the dispatcher as `planned`
- `init-run` step transitions `planned -> running`
- the final `complete-run` step sets `completed` (or `failed` on an invalid graph)
- the dispatcher's cancellation projection sets `canceled` (see Cancellation)

`status` transitions are guarded so a concurrently-canceled run is never flipped
back to a running/completed state.

## Per-node primitives

The graph is a rooted tree (the DTO validator guarantees one trigger and one
incoming edge per node), so each node is visited once and its node id is a
stable, unique step id.

| Node | Primitive |
| --- | --- |
| trigger | `init-run` step: status `running` + trigger step log + `run_started` |
| condition | inline CEL evaluation (deterministic), projected in a memoized step |
| wait | compute `waitUntil` (memoized) → `step.sleepUntil` → reload context |
| wait-for-confirmation | `step.waitForEvent("appointment.confirmed", { timeout, if })`; confirmed → continue, timeout → end |
| send-* | `step.run("send:<node>", () => dispatchForActionType(...))` + delivery/step-log/run-event projection |

**Determinism contract:** every read of mutable external state (appointment/
client context, computed wait/timeout times, `requiresConfirmation`,
appointment status) happens inside a memoized `step.run`, and all branch
decisions are pure functions of memoized step outputs. Replays re-read the
memoized values and take identical branches, so step ids stay stable and side
effects (sends, run-event writes) never repeat.

## Delivery and Step Statuses

Delivery statuses (`planned`, `sent`, `failed`, `canceled`, `skipped`) and step
log statuses (`pending`, `running`, `success`, `error`, `cancelled`) are defined
in `packages/dto/src/schemas/journey.ts`. A send step writes a `sent` projection;
an async-callback provider (Twilio) writes `planned` and is finalized to
`sent`/`failed` by the callback function
(`apps/api/src/services/integrations/twilio/callbacks.ts`).

## Run Event Vocabulary

`journey_run_events.event_type` is string-based and append-only. Common values:

- `run_created` (dispatcher), `run_started`, `run_completed`,
  `run_confirmation_timed_out`, `run_canceled`, `run_failed`
- `run_waiting`, `run_waiting_confirmation`, `run_confirmation_received`,
  `run_confirmation_timeout`
- `delivery_sent`, `delivery_provider_accepted`, `delivery_failed`

A failed async delivery (e.g. Twilio reporting `failed`) is recorded as a
`delivery_failed` run event and on the delivery row by the callback; the run's
own status is not changed by it (the run completes when its walk finishes).

## Restart and Cancellation

- **Restart** (`appointment.rescheduled`): `cancelOn` stops the in-flight run, and
  the dispatcher cancels the DB run row and starts a fresh scheduled run.
- **Stop** (`appointment.canceled` / `appointment.no_show`): `cancelOn` stops the
  in-flight run; the dispatcher cancels the DB run row and, if the trigger's
  terminal branch has nodes, starts a terminal-branch run.
- **Confirmation** (`appointment.confirmed`): handled entirely by the run
  function's `step.waitForEvent` — the dispatcher ignores it.

Because `cancelOn` runs no cleanup code, the DB run row is canceled by the
dispatcher's projection (`cancelActiveInngestRunsForJourney`), keeping the
overlay accurate independent of the function's cancellation.

Admin cancellation endpoints (`apps/api/src/routes/journeys.ts`):

- `POST /journeys/runs/{runId}/cancel`
- `POST /journeys/{id}/runs/cancel`

## Retry and Replay Boundaries

- Domain trigger functions retry (`retries: 3`); the run function retries
  (`retries: 3`) and replays from its step log.
- A mid-wait crash resumes from the durable sleep without re-running memoized
  steps or re-sending.
- Send-step provider retries are bounded per provider
  (`apps/api/src/services/delivery-provider-registry.ts`); idempotency keys
  (`<runId>:<nodeId>`) make a send exactly-once.

## Related

- Domain trigger guide: [`./journey-engine-domain-events.md`](./journey-engine-domain-events.md)
- Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
