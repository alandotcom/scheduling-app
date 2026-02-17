# Existing Patterns

## API and service layering

- Workflow routes are thin oRPC handlers that delegate to `workflowService`, and mutating operations are guarded with `adminOnly` while reads use `authed` (`apps/api/src/routes/workflows.ts:38`, `apps/api/src/routes/workflows.ts:65`, `apps/api/src/routes/workflows.ts:79`, `apps/api/src/routes/workflows.ts:142`).
- Service-level validation uses DTO `safeParse` plus `ApplicationError` details for bad inputs (`apps/api/src/services/workflows.ts:173`, `apps/api/src/services/workflows.ts:176`, `apps/api/src/services/workflows.ts:185`, `apps/api/src/services/workflows.ts:188`).
- Repository methods consistently set org context before queries and writes (`apps/api/src/repositories/workflows.ts:123`, `apps/api/src/repositories/workflows.ts:195`, `apps/api/src/repositories/workflows.ts:253`).

## Event taxonomy and emit pipeline

- Domain event taxonomy is currently inherited from webhook taxonomy (`packages/dto/src/schemas/domain-event.ts:14`, `packages/dto/src/schemas/webhook.ts:17`).
- Appointment service currently emits `appointment.created` for create and `appointment.updated` for update/cancel/reschedule/no-show (`apps/api/src/services/appointments.ts:338`, `apps/api/src/services/appointments.ts:409`, `apps/api/src/services/appointments.ts:477`, `apps/api/src/services/appointments.ts:604`, `apps/api/src/services/appointments.ts:670`).
- Typed emitter keys are generated in one place and map to `appointment.created|updated|deleted` names (`apps/api/src/services/jobs/emitter.ts:100`, `apps/api/src/services/jobs/emitter.ts:101`, `apps/api/src/services/jobs/emitter.ts:102`, `apps/api/src/services/jobs/emitter.ts:103`).
- Inngest fanout and domain-trigger functions are generated from `domainEventTypes`, so taxonomy changes propagate broadly from DTO (`apps/api/src/inngest/functions/workflow-domain-triggers.ts:47`, `apps/api/src/inngest/functions/integration-fanout.ts:105`).

## Runtime orchestration and idempotency

- Trigger semantics are start/restart/stop with precedence `stop > restart > start` (`apps/api/src/services/workflow-trigger-registry.ts:120`, `apps/api/src/services/workflow-trigger-registry.ts:124`, `apps/api/src/services/workflow-trigger-registry.ts:128`).
- Manual and domain-trigger execution both go through `orchestrateTriggerExecution` and currently include `dryRun` handling (`apps/api/src/services/workflows.ts:902`, `apps/api/src/services/workflow-domain-triggers.ts:287`, `apps/api/src/services/workflow-trigger-orchestrator.ts:32`, `apps/api/src/services/workflow-trigger-orchestrator.ts:97`).
- Worker cancellation uses Inngest `cancelOn` by `executionId` (`apps/api/src/inngest/functions/workflow-run-requested.ts:13`, `apps/api/src/inngest/functions/workflow-run-requested.ts:16`).
- Idempotency uses deterministic event IDs in runtime events and DB unique constraints for trigger dedupe (`apps/api/src/inngest/runtime-events.ts:83`, `packages/db/src/schema/index.ts:510`, `packages/db/src/schema/index.ts:513`, `apps/api/src/services/workflow-domain-triggers.ts:102`, `apps/api/src/services/workflow-domain-triggers.ts:148`).

## Current builder and runs UI conventions

- Builder is graph-native (React Flow) and permits arbitrary connect/reconnect except self-loop prevention (`apps/admin-ui/src/features/workflows/workflow-editor-canvas.tsx:55`, `apps/admin-ui/src/features/workflows/workflow-editor-canvas.tsx:285`, `apps/admin-ui/src/features/workflows/workflow-editor-canvas.tsx:359`).
- Action catalog currently includes `http-request`, `condition`, `switch`, `wait`, and `logger` (`apps/admin-ui/src/features/workflows/action-registry.ts:68`, `apps/admin-ui/src/features/workflows/action-registry.ts:119`, `apps/admin-ui/src/features/workflows/action-registry.ts:136`, `apps/admin-ui/src/features/workflows/action-registry.ts:153`, `apps/admin-ui/src/features/workflows/action-registry.ts:219`).
- Selecting `switch` auto-generates three branch nodes/edges (`created|updated|deleted`) in store state (`apps/admin-ui/src/features/workflows/workflow-editor-store.ts:29`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:678`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:689`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:720`).
- Runs panel uses polling + status hydration and allows cancel when run is waiting (`apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:196`, `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:229`, `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx:550`).

## Existing overlap and filter behavior

- Overlap warning currently exists in trigger config UI for shared start/restart/stop events and is warning-only display (`apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx:82`, `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx:223`).
- Current runtime condition/filtering is a custom expression tokenizer/parser with safety regexes, not AST + CEL (`apps/api/src/services/workflow-run-requested.ts:33`, `apps/api/src/services/workflow-run-requested.ts:710`, `apps/api/src/services/workflow-run-requested.ts:722`).

## Test patterns to mirror

- DTO tests use `safeParse` acceptance/rejection checks for schema contracts (`packages/dto/src/schemas/workflow.test.ts:19`, `packages/dto/src/schemas/workflow.test.ts:31`, `packages/dto/src/schemas/workflow.test.ts:223`).
- API route tests use `@orpc/server` `call(...)` with real DB org contexts and role checks (`apps/api/src/routes/workflows.test.ts:2`, `apps/api/src/routes/workflows.test.ts:181`, `apps/api/src/routes/workflows.test.ts:264`).
- Inngest function tests use `InngestTestEngine` for end-to-end event execution (`apps/api/src/inngest/functions/workflow-domain-triggers.test.ts:2`, `apps/api/src/inngest/functions/workflow-run-requested.test.ts:2`).
- DB constraints tests validate index/uniqueness behavior directly via inserts (`packages/db/src/workflows.constraints.test.ts:46`, `packages/db/src/workflows.constraints.test.ts:159`, `packages/db/src/workflows.constraints.test.ts:252`).
