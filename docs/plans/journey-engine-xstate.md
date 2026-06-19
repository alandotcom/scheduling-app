# Journey Engine on XState — Design Rationale

Status: proposal / decision doc
Scope: a from-scratch rebuild of the journey engine as a portable package, with the visual builder as a first-class consumer.

## Why this document exists

We want to rebuild the journey engine so it can be lifted out of this app and dropped into a different one. The engine and the builder UI are two halves of the same thing: the builder edits a graph, the engine runs that graph, and the run view replays it. The thesis here is that XState v5 is the right substrate for that shared definition, and that choosing it makes the builder dramatically cheaper to build rather than harder.

This is not an argument for adding XState to the current engine. It is an argument for what the rebuilt engine's core should be.

## The shape we already have

The journey definition is already a serializable graph, not hand-written code. From `packages/dto/src/schemas/workflow-graph.ts`:

- `SerializedJourneyGraph` = `{ nodes: SerializedWorkflowNode[], edges: SerializedWorkflowEdge[] }`
- A node carries `attributes.data` discriminated on `type: "trigger" | "action"`, plus a `config`.
- Action nodes name themselves through `config.actionType`: `wait`, `wait-for-confirmation`, `send-resend`, `send-resend-template`, `send-slack`, `send-twilio`, `condition`, `logger`.
- Branching already exists. Condition nodes fan out on `true` / `false`; trigger nodes fan out on `scheduled` / `canceled` / `no_show`. Branch identity rides on the edge `sourceHandle` (see `workflow-editor-store.ts`).
- The validator in `packages/dto/src/schemas/journey.ts` enforces a rooted tree: exactly one trigger, no incoming edges into the trigger, and every non-trigger node has exactly one incoming edge. There are no re-converging (join) nodes today.

The builder in `apps/admin-ui/src/features/workflows/` edits this as a React Flow (`@xyflow/react`) graph (`WorkflowCanvasNode`/`WorkflowCanvasEdge`) and serializes back to `SerializedJourneyGraph` through `serializeWorkflowGraph` / `deserializeWorkflowGraph`.

Two facts matter for everything below:

1. The thing the user draws is already a state graph. Nodes are states, edges are transitions, handles are branch labels. We are hand-rolling a state machine without calling it one.
2. We have already started building the run-overlay layer. `workflow-editor-store.ts` defines `workflowExecutionViewGraphAtom`, `workflowExecutionLogsByNodeIdAtom`, and `workflowExecutionEdgeStatusByEdgeIdAtom` (`"default" | "active" | "traversed"`), and `workflow-graph.ts` defines `WorkflowNodeRuntimeStatus` (`idle | running | success | error | cancelled`). That overlay wants a per-node, per-edge run state to render. A state machine snapshot is exactly that.

## What XState v5 gives us

XState v5 separates the machine (pure data plus logic) from the actor (the running interpreter). Three capabilities carry the proposal:

- A pure transition step. `transition(logic, snapshot, event)` returns the next snapshot plus the actions that snapshot wants performed, with nothing executed. This is a deterministic reducer over our graph.
- Serializable snapshots. `actor.getPersistedSnapshot()` produces a plain object we can store; `createActor(machine, { snapshot })` rehydrates it in any process. That is our run state, and it is portable across a process restart or a different host app.
- Graph tooling. `@xstate/graph` (`getShortestPaths`, `getSimplePaths`, `getStateNodes`, `toDirectedGraph`) walks a machine and reports reachable states, unreachable states, and every path through it. `@statelyai/inspect` and Stately Studio visualize and validate machines.

The vocabulary lines up with the domain almost one-to-one:

| Journey concept (today) | XState v5 concept |
| --- | --- |
| action node (`send-resend`, `send-slack`) | a state whose entry emits a dispatch command |
| `condition` node with `true` / `false` handles | a state with guarded transitions (or eventless `always` transitions) |
| `wait` node | a state entered with "schedule a resume," exited by a `RESUME` event |
| `wait-for-confirmation` with timeout | a state with a `CONFIRMED` transition and a `TIMEOUT` transition |
| trigger `start` / `restart` / `stop` (`appointment.scheduled` / `rescheduled` / `canceled`) | events the root machine handles from any state |
| run status (`planned`/`running`/`completed`/`canceled`/`failed`) | the machine's current state value |
| `WorkflowNodeRuntimeStatus` per node in the overlay | the snapshot's active state plus its transition history |

The row that pays for the whole migration is run status. Today `apps/api/src/services/journey-run-status.ts` infers run status by inspecting delivery rows, because there is no explicit machine. With a machine the state value is the status, directly, and "status drifted from what actually happened" stops being a representable bug. The `restart` and `stop` semantics stop being separate routing branches and become events the root machine accepts from wherever the run currently sits.

## Architecture: graph data is the source, the machine is the compiled form

The engine keeps the stored artifact as graph data, exactly as it is now, and adds one pure function that compiles graph data into an XState machine. The builder stays a graph editor. Nothing about the persisted format forces XState onto a consuming app's API surface.

```
SerializedJourneyGraph  (stored, edited by the builder)
        │
        │  compileJourneyMachine(graph)   ← one pure function
        ▼
   XState machine (logic)
        │
        │  transition(machine, snapshot, event)   ← pure, per step
        ▼
   next snapshot  +  commands[]   (scheduleWait, dispatchDelivery, emitEvent, …)
        │
        ▼
   host shell performs commands; feeds results back as events
```

A run is then a loop the host owns:

1. Load the run's persisted snapshot (or compute the initial one for a new run).
2. Apply the incoming event with the pure `transition`.
3. Persist the new snapshot.
4. Hand the emitted commands to the host's adapters.

This is event-sourced. The snapshot is the only run state that needs to survive, and it is a plain serializable object. That is what makes the engine portable: a different app supplies its own persistence and its own scheduler, and the engine core does not change.

### Durability lives in the host, not in XState's timers

A journey waits days and must survive a crashed worker, so we deliberately do not run a long-lived actor that owns in-memory `after` timers or in-flight `invoke` promises. A `wait` does not compile to `after`. It compiles to a state whose entry emits a `scheduleResume(runId, stepKey, at)` command and whose only exit is an external `RESUME` event:

```ts
// compiled form of a `wait` node (sketch)
wait_1: {
  entry: emit({ type: "scheduleResume", stepKey: "wait_1", at: /* computed */ }),
  on: { RESUME: "send_email_1" },
},

// compiled form of `wait-for-confirmation`
wait_for_confirmation_1: {
  entry: emit({ type: "scheduleResume", stepKey: "wait_for_confirmation_1", at: /* timeout */ }),
  on: {
    CONFIRMED: "send_thanks_1",
    TIMEOUT:   "send_reminder_1",
  },
},

// compiled form of a `condition` node
condition_1: {
  always: [
    { guard: "expr_1", target: "branch_true_1" },
    { target: "branch_false_1" },
  ],
},
```

The host's durable substrate (whatever the consuming app runs) delivers `RESUME`, `CONFIRMED`, and `TIMEOUT` at the right time. XState supplies the transition logic and the serialization format; the host supplies time and at-least-once execution. We use XState as a pure state-transition engine and leave its live-actor machinery on the shelf, on purpose.

### Side effects are commands, not invocations

A `send-resend` node's entry emits a `dispatchDelivery` command. The shell performs the send and feeds back `DELIVERED` or `FAILED`, which the machine handles like any other event. This keeps the engine deterministic and testable, and it means the provider registry (`send-resend`, `send-slack`, `send-twilio`) stays a host concern, not an engine concern.

## Why this makes the builder easier to build, not harder

The builder is the part we most want to make cheap, and it is where XState's payoff is largest, because the builder and the engine now share one definition.

### One definition, three consumers

Today the same graph data is interpreted three times by three different code paths: the builder renders it, the planner walks it to execute, and the run view overlays execution state on it. Each path re-derives structure. With a compiled machine, the structure is computed once and the three consumers read the same artifact. The builder edits graph data; `compileJourneyMachine` produces the machine the engine runs and the run view replays.

### The run overlay is a snapshot render

The overlay atoms in `workflow-editor-store.ts` already want exactly what a snapshot provides. A persisted snapshot names the active state and carries the history of states it passed through, which maps onto:

- `workflowExecutionViewGraphAtom` — the graph to show (the compiled-from definition).
- `workflowExecutionLogsByNodeIdAtom` — per-node status, keyed by the same node id the snapshot's state value uses.
- `workflowExecutionEdgeStatusByEdgeIdAtom` — `"active"` for the edge into the current state, `"traversed"` for edges already taken.

"Show me where every contact is in this journey right now" becomes: load each run's snapshot, light up the node it names. The feature we have been scaffolding by hand is a near-direct projection of the snapshot we would already be persisting.

### Validation and dead-step detection come from `@xstate/graph`

`workflow-editor-store.ts` and the DTO validator hand-roll graph analysis: `collectReachableNodeIds`, a connectivity DFS in `linearJourneyGraphSchema`, branch-label bookkeeping, "wait not allowed on terminal branches." A good chunk of this is generic graph reasoning that `@xstate/graph` does for us once a graph compiles to a machine:

- Unreachable steps: a state with no path from the initial state. `getShortestPaths` reports reachability; we flag the rest in the builder.
- Path preview: `getSimplePaths` enumerates every route from trigger to a terminal state, which powers a "here are the N ways a contact can flow through this journey" panel.
- Layout hints: `toDirectedGraph` yields a node/edge structure usable to seed auto-layout in the canvas.

Domain rules that are not generic (a wait is illegal on the canceled branch, branch labels must be exactly `true`/`false`) stay as our own checks. The generic traversal we stop maintaining.

### Dry-run and test mode are pure simulation

We already expose a test run (`startJourneyTestRunSchema`). With the pure `transition` API, the builder can simulate a journey with zero side effects: feed synthetic events into the compiled machine, watch the state advance, and render the same overlay, without dispatching anything. The same machine drives the real run and the simulated one, so a preview cannot diverge from production behavior.

### The node/edge model maps without translation

The builder's connection logic in `workflow-editor-store.ts` already encodes branch identity on `sourceHandle` and normalizes condition (`true`/`false`) and trigger (`scheduled`/`canceled`/`no_show`) branches. Those handles are exactly multiple transitions out of one state, distinguished by guard or event. The builder keeps doing what it does; the compiler reads handles into transitions.

### Inspector and Stately tooling for free

In development, `@statelyai/inspect` visualizes a live machine's transitions, which is a faster way to debug a misbehaving journey than reading delivery rows. Because a journey compiles to a standard machine, Stately Studio can render and inspect it, and can serve as a reference or secondary visual editor for the team building the canvas.

## The honest part: the dynamic-graph tradeoff

XState gives the most type inference when a machine is written by hand with `setup({ types, actions, guards })`. Our machines are generated from stored graph data, so that end-to-end inference does not apply to the generated machine. We accept this on purpose. The typing we care about lives in the graph DTO (`@scheduling/dto`), which is where authoring already happens and where validation already runs. The compiler is the one place that handles the data-to-machine conversion, and it is small and centralized.

This is the right tradeoff because the alternative is what we have now: a bespoke interpreter (`journey-planner.ts`, ~2.5k lines) plus bespoke status inference plus bespoke graph validation, all hand-maintained. Compiling to a machine trades that for one compiler function and a well-specified transition engine with documented semantics.

## What we stop hand-writing

- Status inference from delivery rows (`journey-run-status.ts`) becomes "read the snapshot's state."
- Restart/stop routing becomes events the root machine accepts.
- Generic graph traversal and reachability (in the store and the DTO validator) defers to `@xstate/graph`.
- The run-overlay wiring stops needing a custom execution model; it renders a snapshot.

## What stays ours

- The stored format (`SerializedJourneyGraph`) and the DTO validation of domain rules.
- The durable scheduler and the side-effect adapters (email/SMS/Slack), which are host concerns and the seam that keeps the engine portable.
- The CEL condition semantics, surfaced to XState as named guards.

## When this pays off versus a hand-rolled reducer

If journeys stayed strictly linear, a hand-written reducer would be defensible and lighter. They are already branching (condition and trigger fan-out), and the moment we want parallel branches that run concurrently, reusable sub-journeys, or history (resume a branch where it left off), a state machine earns its keep and a hand-rolled reducer starts reinventing statechart semantics and getting the edge cases wrong. For a product whose core artifact is a user-drawn graph, standardizing on the model that is literally a drawn graph is the durable choice.

## Reference: `compileJourneyMachine` for the appointment-reminder flow

This is a working sketch, not production code. It assumes a graph that already passed `linearJourneyGraphSchema`, so it skips the validation the DTO already does and focuses on the data-to-machine compile and the host loop. The `transition` / `initialTransition` helpers require `xstate >= 5.18`; on older versions, drive the machine with `createActor(machine, { snapshot }).getPersistedSnapshot()` instead.

### The example journey

A reminder flow that exercises every node type in the first slice. Branch labels are the edge `sourceHandle` values the builder already writes.

```
trigger ──scheduled──▶ condition_1            (only remind if the appointment is far enough out)
        └─canceled───▶ send_cancel_email      (leaf: dispatch, then the run completes)

condition_1 ──true──▶ wait_1 ──▶ send_email_1 ──▶ wait_for_confirmation_1
            └─false─▶ (completed)

wait_for_confirmation_1 ──confirmed──▶ (completed)
                        └─timeout────▶ send_sms_1 ──▶ (completed)
```

`wait-for-confirmation` here has explicit `confirmed` / `timeout` branch handles. That is a deliberate rebuild change: today the timeout path is buried in config and handled by an internal event, and surfacing it as two edges makes the builder show the user both outcomes.

### Engine types

The engine speaks in commands and events. It never performs a side effect; it emits a command and waits for the host to feed back the result as an event. CEL evaluation is injected so the engine carries no CEL dependency.

```ts
import { createMachine, assign } from "xstate";
import type {
  SerializedJourneyGraph,
  SerializedWorkflowNode,
  SerializedWorkflowEdge,
} from "@scheduling/dto";

// What the host shell performs. The engine only describes intent.
export type JourneyCommand =
  | { type: "scheduleResume"; stepKey: string; waitConfig: Record<string, unknown> }
  | { type: "scheduleTimeout"; stepKey: string; waitConfig: Record<string, unknown> }
  | { type: "cancelScheduled"; reason: "restart" | "stop" }
  | { type: "dispatchDelivery"; stepKey: string; channel: string; actionType: string; config: Record<string, unknown> }
  | { type: "log"; stepKey: string; config: Record<string, unknown> };

// Domain events plus host callbacks the machine reacts to.
export type JourneyEvent =
  | { type: "RESUME"; stepKey: string }
  | { type: "CONFIRMED"; stepKey: string }
  | { type: "TIMEOUT"; stepKey: string }
  | { type: "DELIVERED"; stepKey: string }
  | { type: "FAILED"; stepKey: string; reason?: string }
  | { type: "RESCHEDULED" }
  | { type: "CANCELED" };

export type JourneyContext = {
  trigger: Record<string, unknown>; // appointment/client snapshot, read by condition guards
  commands: JourneyCommand[];        // this step's output, drained by the host then reset
};

export type CompileDeps = {
  evaluateCondition: (expression: string, trigger: Record<string, unknown>) => boolean;
};

const CHANNEL_BY_ACTION: Record<string, string> = {
  "send-resend": "email",
  "send-resend-template": "email",
  "send-slack": "slack",
  "send-twilio": "sms",
};
```

### The compiler

```ts
function nodeId(node: SerializedWorkflowNode) {
  return node.attributes.id;
}

function nodeKind(node: SerializedWorkflowNode): string {
  const data = node.attributes.data;
  if (data.type === "trigger") return "trigger";
  const config = data.config as Record<string, unknown> | undefined;
  return String(config?.actionType ?? "").trim().toLowerCase();
}

function nodeConfig(node: SerializedWorkflowNode): Record<string, unknown> {
  const config = node.attributes.data.config;
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}

// Branch identity rides on sourceHandle, with the same fallbacks the builder uses.
function branchOf(edge: SerializedWorkflowEdge): string | null {
  const attrs = edge.attributes as Record<string, unknown>;
  if (typeof attrs.sourceHandle === "string" && attrs.sourceHandle.length > 0) {
    return attrs.sourceHandle;
  }
  const data = (attrs.data ?? {}) as Record<string, unknown>;
  const branch = data.conditionBranch ?? data.triggerBranch ?? attrs.label;
  return typeof branch === "string" && branch.length > 0 ? branch : null;
}

export function compileJourneyMachine(graph: SerializedJourneyGraph, deps: CompileDeps) {
  // successors.get(sourceId) = { [branch | "next"]: targetId }
  const successors = new Map<string, Record<string, string>>();
  for (const node of graph.nodes) successors.set(nodeId(node), {});
  for (const edge of graph.edges) {
    successors.get(edge.source)![branchOf(edge) ?? "next"] = edge.target;
  }

  const trigger = graph.nodes.find((node) => nodeKind(node) === "trigger");
  if (!trigger) throw new Error("journey graph has no trigger node");
  const triggerOut = successors.get(nodeId(trigger))!;
  const startId = triggerOut["scheduled"] ?? triggerOut["next"];
  if (!startId) throw new Error("trigger has no scheduled successor");
  const canceledId = triggerOut["canceled"] ?? triggerOut["no_show"]; // optional

  const pushCommand = (command: JourneyCommand) =>
    assign({
      commands: ({ context }: { context: JourneyContext }) => [...context.commands, command],
    });

  // a fired callback only advances the state it was meant for
  const forStep = (id: string) => ({ event }: { event: JourneyEvent }) =>
    "stepKey" in event ? event.stepKey === id : true;

  const states: Record<string, unknown> = {
    __completed: { type: "final" },
    __canceled: { type: "final" },
    __failed: { type: "final" },
  };

  for (const node of graph.nodes) {
    const id = nodeId(node);
    const kind = nodeKind(node);
    if (kind === "trigger") continue;

    const out = successors.get(id)!;
    const next = out["next"];
    const config = nodeConfig(node);

    switch (kind) {
      case "wait":
        states[id] = {
          entry: pushCommand({ type: "scheduleResume", stepKey: id, waitConfig: config }),
          on: { RESUME: { target: next ?? "__completed", guard: forStep(id) } },
        };
        break;

      case "wait-for-confirmation":
        states[id] = {
          entry: pushCommand({ type: "scheduleTimeout", stepKey: id, waitConfig: config }),
          on: {
            CONFIRMED: { target: out["confirmed"] ?? out["next"] ?? "__completed", guard: forStep(id) },
            TIMEOUT: { target: out["timeout"] ?? "__completed", guard: forStep(id) },
          },
        };
        break;

      case "send-resend":
      case "send-resend-template":
      case "send-slack":
      case "send-twilio":
        states[id] = {
          entry: pushCommand({
            type: "dispatchDelivery",
            stepKey: id,
            channel: CHANNEL_BY_ACTION[kind] ?? "unknown",
            actionType: kind,
            config,
          }),
          on: {
            DELIVERED: { target: next ?? "__completed", guard: forStep(id) },
            FAILED: { target: "__failed", guard: forStep(id) },
          },
        };
        break;

      case "condition": {
        const expression = String(config.expression ?? "true");
        states[id] = {
          // eventless: evaluated the moment the state is entered
          always: [
            {
              guard: ({ context }: { context: JourneyContext }) =>
                deps.evaluateCondition(expression, context.trigger),
              target: out["true"] ?? "__completed",
            },
            { target: out["false"] ?? "__completed" },
          ],
        };
        break;
      }

      case "logger":
        states[id] = {
          entry: pushCommand({ type: "log", stepKey: id, config }),
          always: { target: next ?? "__completed" },
        };
        break;

      default:
        states[id] = { always: { target: next ?? "__completed" } };
    }
  }

  return createMachine({
    types: {} as {
      context: JourneyContext;
      events: JourneyEvent;
      input: Record<string, unknown>;
    },
    id: "journey",
    initial: startId,
    context: ({ input }) => ({ trigger: input ?? {}, commands: [] }),
    // restart and stop are handled from any state, exactly the trigger's restart/stop config
    on: {
      RESCHEDULED: {
        target: startId,
        reenter: true,
        actions: pushCommand({ type: "cancelScheduled", reason: "restart" }),
      },
      CANCELED: {
        target: canceledId ?? "__canceled",
        actions: pushCommand({ type: "cancelScheduled", reason: "stop" }),
      },
    },
    states,
  });
}
```

A few things to notice in the output. A leaf node (no successor) targets `__completed`, so a run ending on a send still dispatches and then finishes. `condition` compiles to eventless `always` transitions, so it resolves in the same step that enters it rather than parking the run. `RESCHEDULED` re-enters the start state and emits a `cancelScheduled` command so the host can tear down any timers from the prior pass.

### The host loop

The host owns persistence, time, and side effects. Each step is: apply one event with the pure `transition`, persist the new snapshot with its command buffer cleared, then perform the commands.

```ts
import { initialTransition, transition, type AnyMachineSnapshot } from "xstate";

type RunStatus = "planned" | "running" | "completed" | "canceled" | "failed";

function runStatusOf(snapshot: AnyMachineSnapshot): RunStatus {
  if (snapshot.status !== "done") return "running";
  const value = snapshot.value as string;
  if (value === "__canceled") return "canceled";
  if (value === "__failed") return "failed";
  return "completed";
}

async function commitStep(next: AnyMachineSnapshot, host: JourneyHost) {
  const commands = next.context.commands as JourneyCommand[];
  // persist with the buffer emptied so a command can never be re-emitted by a replay
  const persisted = { ...next, context: { ...next.context, commands: [] } };
  await host.saveRun({ snapshot: persisted, status: runStatusOf(next) });
  for (const command of commands) {
    await host.perform(command); // scheduleResume / scheduleTimeout / dispatchDelivery / cancelScheduled / log
  }
}

// start a run on appointment.scheduled
async function startRun(graph: SerializedJourneyGraph, triggerSnapshot: Record<string, unknown>, host: JourneyHost) {
  const machine = host.compiledMachineFor(graph); // cache by journey version id
  const [first] = initialTransition(machine, triggerSnapshot);
  await commitStep(first, host);
}

// resume on any later event (RESUME, CONFIRMED, DELIVERED, RESCHEDULED, CANCELED, ...)
async function resumeRun(graph: SerializedJourneyGraph, persistedSnapshot: unknown, event: JourneyEvent, host: JourneyHost) {
  const machine = host.compiledMachineFor(graph);
  const [next] = transition(machine, persistedSnapshot as AnyMachineSnapshot, event);
  await commitStep(next, host);
}
```

One honest caveat on `commitStep`: it persists before performing, so a crash between the save and a `dispatchDelivery` would drop that send. For at-least-once delivery, write the commands as an outbox row in the same transaction as the snapshot and mark each done after the host performs it. That is the same durability seam described earlier, made concrete.

### Projecting a snapshot onto the builder overlay

Because the machine is flat (one state per node), `snapshot.value` is the active node id, which is exactly the key the overlay atoms use.

```ts
function overlayFromSnapshot(snapshot: AnyMachineSnapshot) {
  return {
    activeNodeId: snapshot.value as string,        // → workflowExecutionLogsByNodeIdAtom (mark running)
    status: runStatusOf(snapshot),                  // → run header
  };
}
```

Feed `activeNodeId` into `workflowExecutionLogsByNodeIdAtom` and set the incoming edge to `"active"` in `workflowExecutionEdgeStatusByEdgeIdAtom`. To paint `"traversed"` edges, keep a visited-node set next to the snapshot, since a flat machine does not retain the full path on its own. "Where is every contact right now" is then a query over saved snapshots, one lit node each.

### From here

1. Drop the compiler and host loop above behind the existing scheduler and confirm the reminder flow runs end to end against a seeded appointment.
2. Project the snapshot into the overlay atoms and check the run view lights up the right node as events arrive.
3. Diff behavior against the current `journey-planner.ts` on the same journey, then compile the remaining action types.
