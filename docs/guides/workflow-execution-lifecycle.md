# Workflow Execution Lifecycle

This guide defines the runtime contract for workflow execution state, event vocabulary, and ordering guarantees.

## Runtime Artifacts

Workflow execution state is split across these tables:

- `workflow_executions`
- `workflow_execution_logs`
- `workflow_execution_events`
- `workflow_wait_states`

## Execution Status Transitions

Valid `workflow_executions.status` transitions:

- `running -> success`
- `running -> error`
- `running -> waiting`
- `running -> cancelled`
- `waiting -> running`
- `waiting -> cancelled`

Terminal states:

- `success`
- `error`
- `cancelled`

`executeWorkflowRunRequested` exits early for terminal executions and does not emit new logs/events for them.

## Event Vocabulary

Execution events use the `run.*` namespace.

- `run.started`
- `run.log`
- `run.waiting`
- `run.resumed`
- `run.failed`
- `run.completed`
- `run.cancel.requested`
- `run.cancelled`

Transport/runtime control events sent to Inngest use `workflow/run.*` names and are separate from persisted execution events:

- `workflow/run.requested`
- `workflow/run.cancel.requested`

## Ordering Guarantees

### Logs and Events

- `workflow_execution_logs` and `workflow_execution_events` are persisted append-only.
- UI timelines should render oldest to newest.
- Node-level detail for run events is carried in event metadata (`nodeId`, `nodeName`) when relevant.

### Node Scheduling

- Node readiness is dependency-gated.
- Fan-out branches can run in parallel when ready.
- Fan-in nodes run only after all incoming dependencies complete.
- Wait nodes pause only their branch; sibling ready branches continue.

### Completion

- `run.completed` is appended only when execution remains non-terminal after scheduler completion.
- `run.failed` is appended when a node execution throws and the execution is marked `error`.

## Retry and Replay Boundaries

- Domain event trigger dedupe is enforced with `(org_id, workflow_id, trigger_event_id)` uniqueness.
- Replays of already-successful executions do not create duplicate node logs/events.
- Inngest function retries differ by function policy:
  - Domain trigger fanout function has retries enabled.
  - `workflow-run-requested` runs with `retries: 0` and relies on runtime idempotency.

## Cancellation Semantics

- Manual cancellation (`POST /workflows/executions/{executionId}/cancel`) requires a waiting execution.
- Cancellation is requested through `workflow/run.cancel.requested` and then persisted as:
  - `run.cancel.requested`
  - `run.cancelled`
- Waiting states and execution rows are cancelled together in a single DB cancellation path.
