# Implementation Context

## Research summary

- The current system is still the legacy workflow graph engine end to end: graph DTOs, workflow tables, workflow routes/services, graph runtime, and graph-based admin UI are all active (`packages/dto/src/schemas/workflow.ts:15`, `packages/db/src/schema/index.ts:446`, `apps/api/src/routes/workflows.ts:65`, `apps/api/src/services/workflow-run-requested.ts:82`, `apps/admin-ui/src/features/workflows/workflow-editor-canvas.tsx:63`).
- Appointment lifecycle classification has not been cut over yet: service emits `appointment.created|updated` patterns and typed emitters still target old names (`apps/api/src/services/appointments.ts:338`, `apps/api/src/services/appointments.ts:409`, `apps/api/src/services/jobs/emitter.ts:101`, `apps/api/src/services/jobs/emitter.ts:102`).
- Domain event taxonomy is coupled to webhook taxonomy, so taxonomy updates must land in both surfaces together (`packages/dto/src/schemas/domain-event.ts:14`, `packages/dto/src/schemas/webhook.ts:17`).

## Integration points by delivery slice

## 1) Taxonomy and appointment classifier cutover

- Canonical appointment event names are currently defined in webhook DTO event lists and envelope maps (`packages/dto/src/schemas/webhook.ts:17`, `packages/dto/src/schemas/webhook.ts:90`, `packages/dto/src/schemas/webhook.ts:152`, `packages/dto/src/schemas/webhook.ts:181`).
- Emit callsites for appointment mutations are centralized in `AppointmentService`, making this the main classifier insertion point (`apps/api/src/services/appointments.ts:120`, `apps/api/src/services/appointments.ts:338`, `apps/api/src/services/appointments.ts:604`).
- Webhook catalog grouping and stale pruning logic depend on current names and will need synchronized rename updates (`apps/api/src/services/svix-event-catalog.ts:50`, `apps/api/src/services/svix-event-catalog.ts:104`, `apps/api/src/services/svix-event-catalog.ts:134`).
- Inngest fanout and domain trigger functions auto-generate from `domainEventTypes`, so taxonomy updates propagate from DTO definitions (`apps/api/src/inngest/functions/workflow-domain-triggers.ts:47`, `apps/api/src/inngest/functions/integration-fanout.ts:105`).

## 2) Schema/API replacement (workflow -> journey)

- Current DTO contracts are graph-based and centered on `isEnabled` and `dryRun` (`packages/dto/src/schemas/workflow.ts:20`, `packages/dto/src/schemas/workflow.ts:21`, `packages/dto/src/schemas/workflow.ts:71`, `packages/dto/src/schemas/workflow.ts:108`).
- Current workflow route surface contains CRUD, duplicate, execute, and execution inspection/cancel, with no publish/pause/resume/test-only lifecycle API (`apps/api/src/routes/workflows.ts:65`, `apps/api/src/routes/workflows.ts:98`, `apps/api/src/routes/workflows.ts:142`, `apps/api/src/routes/workflows.ts:245`).
- `workflows` are mounted on the UI router only, not the public OpenAPI router, which matches admin-only mutation expectations and should be preserved for journey management routes (`apps/api/src/routes/index.ts:38`, `apps/api/src/routes/index.ts:54`, `apps/api/src/routes/index.ts:62`).

## 3) Data model replacement

- Existing workflow persistence is split across `workflows`, `workflow_executions`, `workflow_execution_logs`, `workflow_execution_events`, and `workflow_wait_states` (`packages/db/src/schema/index.ts:446`, `packages/db/src/schema/index.ts:478`, `packages/db/src/schema/index.ts:533`, `packages/db/src/schema/index.ts:577`, `packages/db/src/schema/index.ts:616`).
- Idempotency today uses unique run-id and trigger-event indexes in `workflow_executions` (`packages/db/src/schema/index.ts:507`, `packages/db/src/schema/index.ts:510`).
- Relationship graph in Drizzle relations currently references workflow tables from `orgs` and between execution artifacts; this must be updated alongside schema replacement (`packages/db/src/relations.ts:19`, `packages/db/src/relations.ts:191`, `packages/db/src/relations.ts:201`, `packages/db/src/relations.ts:241`).
- Init migration currently contains workflow tables; per repo policy, this is the artifact to update for big-bang schema replacement (`packages/db/src/migrations/20260208064434_init/migration.sql:210`, `packages/db/src/migrations/20260208064434_init/migration.sql:232`, `packages/db/src/migrations/20260208064434_init/migration.sql:252`).

## 4) Planner/worker runtime cutover

- Current runtime split already resembles trigger->run-requested worker, but semantics are graph-node execution rather than journey planner/delivery (`apps/api/src/services/workflow-domain-triggers.ts:244`, `apps/api/src/inngest/functions/workflow-run-requested.ts:24`, `apps/api/src/services/workflow-runtime/scheduler.ts:52`).
- Internal runtime events are currently `workflow/run.requested` and `workflow/run.cancel.requested`; these are defined in typed Inngest schema and helper senders (`apps/api/src/inngest/client.ts:23`, `apps/api/src/inngest/client.ts:37`, `apps/api/src/inngest/runtime-events.ts:79`, `apps/api/src/inngest/runtime-events.ts:97`).
- Worker cancellation race handling already uses `cancelOn`, which is a reusable pattern for delivery identity cancellation semantics (`apps/api/src/inngest/functions/workflow-run-requested.ts:13`, `apps/api/src/inngest/functions/workflow-run-requested.ts:16`).
- Current filter/condition execution is custom parser logic, not constrained CEL (`apps/api/src/services/workflow-run-requested.ts:33`, `apps/api/src/services/workflow-run-requested.ts:407`, `apps/api/src/services/workflow-run-requested.ts:710`).

## 5) UI builder and runs replacement

- Editor currently supports branching and switch branch management in state and UI, which conflicts with linear-only requirement (`apps/admin-ui/src/features/workflows/workflow-editor-store.ts:29`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:678`, `apps/admin-ui/src/features/workflows/workflow-editor-canvas.tsx:284`).
- Action set currently includes non-v1 steps (`http-request`, `condition`, `switch`) and lacks explicit send-message email/slack step (`apps/admin-ui/src/features/workflows/action-registry.ts:68`, `apps/admin-ui/src/features/workflows/action-registry.ts:119`, `apps/admin-ui/src/features/workflows/action-registry.ts:136`).
- Runs UI is execution-centric with status polling and waiting-run cancel, and no explicit `mode=test|live` facets yet (`apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:188`, `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:229`, `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:550`).

## 6) Overlap warning behavior

- Existing overlap warning behavior is local to trigger config for shared start/restart/stop event sets and is non-blocking visual feedback (`apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx:82`, `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx:223`).
- Backend routing precedence (`stop > restart > start`) is deterministic and already encoded in trigger evaluation logic (`apps/api/src/services/workflow-trigger-registry.ts:120`, `apps/api/src/services/workflow-trigger-registry.ts:124`, `apps/api/src/services/workflow-trigger-registry.ts:128`).

## Constraints and gotchas discovered

- No `cel-js` dependency is currently present in API package dependencies; constrained CEL evaluation will require adding a new package (`apps/api/package.json:23`).
- Current manual test path is `dryRun`, and `dryRun` short-circuits to immediate success instead of real execution, which directly conflicts with required real test-mode execution (`apps/api/src/services/workflows.ts:903`, `apps/api/src/services/workflows.ts:925`, `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:315`).
- Test-mode concern A68 asks for both auto-trigger test-only and manual start; current system only has manual execute with sample-event selection UX (`apps/api/src/services/workflows.ts:835`, `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:84`, `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:305`).
- Delivery reason-code taxonomy is currently ad hoc in wait outputs (for example `wait_already_due`, `execution_not_running`) and not modeled as a typed persisted reason code (`apps/api/src/services/workflow-runtime/action-executors.ts:188`, `apps/api/src/services/workflow-runtime/action-executors.ts:223`, `apps/api/src/services/workflow-runtime/action-executors.ts:272`).
- Design critic concerns remain implementation decisions to settle during slicing: email override payload shape and expanded reason-code taxonomy (`specs/workflow-engine-rebuild-appointment-journeys/research/recommendations.md:102`, `specs/workflow-engine-rebuild-appointment-journeys/research/recommendations.md:103`).

## Suggested defaults for the two minor approved-design concerns

- Email override payload shape: default to a single required destination string for v1 test runs (maps cleanly to current single-sample manual execute UX and keeps validation simple), then expand to list semantics only when multi-recipient use cases appear (`apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:476`, `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:496`).
- Delivery reason-code taxonomy: start with a small enum aligned to existing terminal reasoning already present in runtime behavior (`past_due`, `wait_already_due`, `execution_terminal`, `manual_cancel`), and store it explicitly on delivery rows for filtering/debugging parity (`apps/api/src/services/workflow-runtime/action-executors.ts:188`, `apps/api/src/services/workflow-runtime/action-executors.ts:319`, `specs/workflow-engine-rebuild-appointment-journeys/design.md:241`).
