# Technologies

## Backend and runtime stack in use

- API package already uses `hono`, oRPC (`@orpc/server`, `@orpc/openapi`, `@orpc/zod`), `inngest`, `drizzle-orm`, `es-toolkit`, `resend`, and `svix` (`apps/api/package.json:27`, `apps/api/package.json:35`, `apps/api/package.json:36`, `apps/api/package.json:38`, `apps/api/package.json:42`, `apps/api/package.json:45`).
- Typed Inngest schemas are declared centrally in `apps/api/src/inngest/client.ts`, including current internal workflow events (`apps/api/src/inngest/client.ts:1`, `apps/api/src/inngest/client.ts:23`, `apps/api/src/inngest/client.ts:37`, `apps/api/src/inngest/client.ts:58`).
- Wait-time parsing utilities currently depend on `parse-duration` and timezone conversion helpers (`apps/api/src/services/workflow-wait-time.ts:1`, `apps/api/src/services/workflow-wait-time.ts:190`).

## Data and validation stack

- DTOs are Zod-based and exported through schema barrels (`packages/dto/src/schemas/index.ts:1`, `packages/dto/src/schemas/index.ts:20`, `packages/dto/src/schemas/index.ts:21`).
- Workflow graph and trigger contracts are currently defined in `workflow-graph.ts` and `workflow.ts` (`packages/dto/src/schemas/workflow-graph.ts:39`, `packages/dto/src/schemas/workflow-graph.ts:165`, `packages/dto/src/schemas/workflow.ts:15`).
- DB schema is Drizzle-first with RLS and migration SQL maintained in the `init` artifact (`packages/db/src/schema/index.ts:446`, `packages/db/src/schema/index.ts:478`, `packages/db/src/migrations/20260208064434_init/migration.sql:210`).

## Frontend stack in use

- Admin UI uses React 19, TanStack Query/Router, Jotai, and React Flow (`@xyflow/react`) (`apps/admin-ui/package.json:27`, `apps/admin-ui/package.json:28`, `apps/admin-ui/package.json:30`, `apps/admin-ui/package.json:36`, `apps/admin-ui/package.json:41`).
- Workflow editor state is Jotai-driven and graph-serialized/deserialized in store atoms (`apps/admin-ui/src/features/workflows/workflow-editor-store.ts:18`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:223`, `apps/admin-ui/src/features/workflows/workflow-editor-store.ts:246`).

## Integration/channel landscape relevant to journey delivery

- Runtime integration registry currently registers only `svixIntegration` as a system integration (`apps/api/src/services/integrations/registry.ts:5`, `apps/api/src/services/integrations/registry.ts:9`).
- App-managed integration definitions include `resend` and `slack` metadata/settings, but only `logger` has a concrete `consumer` in this file (`apps/api/src/services/integrations/app-managed.ts:27`, `apps/api/src/services/integrations/app-managed.ts:41`, `apps/api/src/services/integrations/app-managed.ts:44`, `apps/api/src/services/integrations/app-managed.ts:97`).
- Runtime worker integration resolution merges system integrations with app-managed consumers (`apps/api/src/services/integrations/runtime.ts:31`, `apps/api/src/services/integrations/runtime.ts:55`).

## Test tooling and conventions available

- API tests run on Bun and use `@inngest/test` for function-level assertions (`apps/api/package.json:17`, `apps/api/package.json:51`).
- Existing Inngest tests already use `InngestTestEngine` patterns for trigger and run functions (`apps/api/src/inngest/functions/workflow-domain-triggers.test.ts:2`, `apps/api/src/inngest/functions/workflow-run-requested.test.ts:2`).
- DB package includes dedicated constraints tests and schema-index assertions for workflow runtime tables (`packages/db/src/workflows.constraints.test.ts:1`, `packages/db/src/workflows.constraints.test.ts:252`).

## Gaps relative to approved design

- `cel-js` is not currently listed in API dependencies; adding constrained CEL evaluation will require introducing a new runtime dependency (`apps/api/package.json:23`).
- Current manual testing contract is `dryRun`-based in DTO/API/UI, not explicit `mode=test|live` (`packages/dto/src/schemas/workflow.ts:71`, `apps/api/src/services/workflows.ts:903`, `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:315`).
