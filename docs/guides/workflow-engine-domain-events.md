# Workflow Engine (Domain Events)

This app runs workflow triggers from canonical domain events, not webhook-specific trigger payloads.

## Trigger Ingress Model

- Canonical event schema source: `packages/dto/src/schemas/domain-event.ts`
- Event producer path: API domain services emit typed events with `inngest.send`
- Workflow consumer path: `apps/api/src/services/workflow-domain-triggers.ts`
- Trigger routing decisions: `start`, `restart`, `stop`, `ignore`

Workflow trigger config uses domain event routing sets:

- `startEvents`
- `restartEvents`
- `stopEvents`

## Authorization and Org Isolation

- Read operations (`list/get/runs/logs/events/status`) are available to authenticated org members.
- Write operations (`create/update/duplicate/remove/cancelExecution/saveCurrent`) are admin-only.
- All workflow tables are org-scoped with RLS (`org_id` + policy), and service queries run within org context.

## Idempotency and Dedupe

- Inngest dedupe uses canonical domain `event.id`.
- Executions persist `trigger_event_id` for domain-triggered starts.
- Duplicate delivery in the same org/workflow is ignored via service pre-check and DB uniqueness (`org_id`, `workflow_id`, `trigger_event_id`).

## Runtime Artifacts

Workflow runtime persistence is split across:

- `workflows`
- `workflow_executions`
- `workflow_execution_logs`
- `workflow_execution_events`
- `workflow_wait_states`

The runs panel in admin UI reads these artifacts through oRPC execution endpoints.

## Manual Smoke Validation

From repo root:

```bash
pnpm dev
pnpm dev:inngest
```

Smoke flow:

1. Login as admin (`admin@example.com` / `password123`).
2. Create or open a workflow in `/workflows/current`.
3. Configure `DomainEvent` trigger routing for at least one canonical event type.
4. Save edits and verify autosave/current workflow persistence.
5. Emit a matching domain event via the API path that normally emits that event.
6. Open the Runs panel and verify execution, logs, events, and status render.
7. Login as a member and confirm read-only editor/runs visibility with blocked mutation actions.

## Regression Validation Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm --filter @scheduling/dto run test
pnpm --filter @scheduling/db run test
pnpm --filter @scheduling/api run test -- src/services/workflow-trigger-registry.test.ts src/services/workflow-trigger-orchestrator.test.ts src/services/workflow-domain-triggers.test.ts src/inngest/functions/workflow-domain-triggers.test.ts src/services/workflows.test.ts src/routes/workflows.test.ts src/routes/webhooks.test.ts
pnpm --filter @scheduling/admin-ui run test -- src/features/workflows/workflow-list-page.test.tsx src/features/workflows/workflow-editor-store.test.ts src/features/workflows/workflow-trigger-config.test.tsx src/features/workflows/workflow-editor-sidebar.test.tsx
pnpm audit --prod --audit-level high
```
