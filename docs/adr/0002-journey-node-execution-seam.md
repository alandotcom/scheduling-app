# ADR 0002: Journey node-execution seam

- Status: Accepted
- Date: 2026-06-20

## Context

The journey-run engine executes a journey by walking the pinned workflow graph and issuing durable Inngest steps per node. The runtime seam was already sound: the executor takes an injected `JourneyRunStepRuntime` (`runStep` / `sleepUntil` / `waitForEvent`), wired to Inngest in production and to a fake in tests, and 12 integration tests cover the full walk including crash/resume replay.

The friction was locality, cut along the wrong axis. The walk and per-node sequencing lived in `journey-run-executor.ts` as a ~170-line `advance()` if-chain over `actionType`, while the matching DB-writing bodies lived in `journey-run-steps.ts` as 12 functions. Understanding or changing one node type meant reading both files, joined by an implicit ordering contract: the executor knew a send is prepare → dispatch → finalize, and the step functions assumed that order. Adding a node type meant extending the if-chain and the 629-line grab-bag, with real step-id-drift risk.

Replay correctness depends on stable step-id strings. Inngest memoizes each durable step by its `stepId`; an in-flight run (mid-wait, or waiting on a confirmation that arrives days later) replays against the exact ids recorded when it started. The three-step send exists specifically so the non-idempotent dispatch is its own checkpoint and never re-sends on replay.

## Decision

Re-cut the engine by node type behind a `NodeHandler` interface.

1. Each node type (wait, condition, wait-for-confirmation, send) has one handler in `journey-run-handlers/` that owns its full lifecycle: its durable-step sequence, its projection writes (via the shared `journey-run-artifacts` upserts), its config resolution, and its own context reload after a durable suspend.
2. A handler takes a `NodeExecutionContext` (runtime, node, run identity, injected deps, graph navigation) and returns `NodeHandlerResult`: `advance` (next node ids plus a possibly-updated cursor and context) or `terminate` (a final `WalkResult`). These values are exchanged in memory and never cross a `runStep` boundary.
3. The executor stays the pure walker: it resolves the handler for a node, calls it, and either walks the returned successors or returns the terminal result. Fan-out, the cycle guard, result combination, and run-level lifecycle (load, start, finalize) stay in the executor. An unrecognized action type resolves to no handler and is treated as a passthrough.
4. Step-id strings move verbatim into the handlers; **step** stays reserved for the durable Inngest primitive, and one handler issues one or more steps.

## Alternatives considered

- **Keep the phase-split.** No churn, but the locality problem stays: every node-type change touches the executor's if-chain and the shared step grab-bag, and a new node type compounds both.
- **Lighter: shared context only.** Introduce `NodeExecutionContext` to remove the repeated input assembly and tidy `advance()`, but leave the step functions in place. Captures part of the win while still requiring two files per node type. Rejected as a half-measure.
- **Centralized step-id registry.** Replace the inline `runStep("wait-enter:" + key)` strings with a builder or constants. Cleaner long-term, but the act of centralizing is itself a rewrite of every id string — the operation most likely to introduce drift — folded into a change whose safety claim is "nothing changed." Deferred to a separate PR.

## Consequences

- Locality: one node type is one file. `advance()` shrinks to handler dispatch.
- Leverage: a new action type is one handler file, one line in `resolveNodeHandler`, and one unit test, in isolation.
- Behavior is unchanged: step-ids, transaction boundaries (one `runStep` is one `withOrg`), projection writes, fan-out, reload, and the current confirmation-timeout semantics (a timeout ends its own downstream path, lets sibling branches finish, and surfaces `confirmation_timed_out` as the run outcome) are preserved. The 12 executor tests pass unchanged and are the regression oracle; the crash/resume test guards step-id and memo stability.
- New per-node handler unit tests exist now that each node type is a clean unit, covering advance / terminate / reload paths in isolation.
- The runtime seam (`JourneyRunStepRuntime`) and the Inngest function (`inngest/functions/journey-run.ts`) are untouched.
- This convention is project-wide: a new journey node type gets a handler in `journey-run-handlers/`, not a branch in the executor.
