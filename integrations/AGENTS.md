# Integrations Workspace — AGENTS.md

This file gives local guidance for agents working in `integrations/`.

## Purpose

`integrations/*` packages are event-driven consumers. Each integration receives the same `DomainEvent` envelope from `@integrations/core`.

## Local Rules

- Do not create per-integration producer contracts. Producers are shared and upstream.
- Implement integrations as thin adapters around external systems.
- Create integrations with `createIntegration(...)` from `@integrations/core`.
- Throw errors on transient/failed delivery so Inngest retry policy can apply.
- Keep package boundaries simple: one package per integration.

## Adding a New Integration

When adding `integrations/<name>`:

1. Create workspace package (`package.json`, `tsconfig.json`, `src/index.ts`).
2. Implement and export `<name>Integration` via `createIntegration`.
3. Add `@integrations/<name>` dependency to `apps/api/package.json`.
4. Register in `apps/api/src/services/integrations/registry.ts` (`allIntegrations`).
5. Add root tsconfig path alias for `@integrations/<name>`.
6. Update docs (`integrations/README.md`, root `README.md`) if behavior changed.

## Adding Integration Action Nodes (Workflow/Journey Runtime)

Use this when adding a new workflow action node backed by an external provider
(for example, `send-sendgrid`).

### Runtime Architecture Rule (Important)

- Integration action nodes must execute through a provider-specific Inngest function.
- Do **not** route integration actions through legacy `journey.delivery.scheduled`.
- Legacy scheduled delivery is logger-only (`apps/api/src/services/journey-delivery-adapters.ts`).

Current examples:
- Resend: `journey.action.send-resend.execute` -> `journey-action-send-resend-execute`
- Slack: `journey.action.send-slack.execute` -> `journey-action-send-slack-execute`

### Journey Delivery Concurrency Budgets (Required)

Source of truth:
- `apps/api/src/inngest/functions/journey-delivery-flow-control.ts`

All journey delivery executors must include both:
- Shared per-org cross-function budget:
  - `key: '"journey-delivery:" + event.data.orgId'`
  - `scope: "env"`
  - `limit: 20`
- Per-function per-org budget:
  - `scope: "fn"`
  - provider-specific `limit`

Current per-function budgets:
- `journey-delivery-scheduled` (logger): `20`
- `journey-action-send-resend-execute`: `10`
- `journey-action-send-slack-execute`: `10`

Why both are required:
- `scope: "env"` prevents one org from consuming unlimited concurrency by fanning out across multiple functions.
- `scope: "fn"` prevents a single executor from monopolizing the shared org budget.

### End-to-End Wiring Checklist

1. Add/extend integration definition
- `packages/dto/src/schemas/integration.ts`: add key to `appIntegrationKeySchema`.
- `apps/api/src/services/integrations/app-managed.ts`: add provider definition
  (`defaultConfig`, required secrets/config, auth strategy, metadata).

2. Add action node(s) in admin UI
- `apps/admin-ui/src/features/workflows/action-registry.ts`:
  - register node id(s) (for example `send-sendgrid`),
  - set `integrationKey`,
  - define config fields.
- If `integrationKey` union is provider-limited, extend it.

3. Allow action type in journey graph schema
- `packages/dto/src/schemas/journey.ts`:
  - add new action type to `supportedJourneyActionTypeSchema`,
  - ensure validation messages remain accurate.

4. Add provider-specific Inngest event type
- `apps/api/src/inngest/client.ts`: add typed internal event schema.
- `apps/api/src/inngest/runtime-events.ts`: add send helper for the new event.

5. Add provider-specific dispatcher and function
- `apps/api/src/services/journey-integration-action-dispatchers.ts`:
  - add dispatcher for the new provider action.
- `apps/api/src/inngest/functions/`:
  - add `journey-action-<provider>-execute.ts`,
  - use `executeJourneyDeliveryScheduled(...)` with provider dispatcher,
  - include `cancelOn` for `journey.delivery.canceled`,
  - include both shared (`scope: "env"`) and per-function (`scope: "fn"`) concurrency entries from `journey-delivery-flow-control.ts`,
  - add TODO for webhook-driven completion if not implemented yet.
- Register in `apps/api/src/inngest/functions/index.ts`.

6. Planner routing (hard cutover)
- `apps/api/src/services/journey-planner.ts`:
  - include action type in desired delivery planning,
  - route that action type to provider-specific scheduler helper,
  - do not rely on generic `scheduleRequester` fallback for integration actions.

7. Tests (required)
- Function test:
  - `apps/api/src/inngest/functions/journey-action-<provider>-execute.test.ts`
  - verify function options and event forwarding.
- Planner tests:
  - assert new action routes through provider-specific scheduler,
  - assert it does not go through slack/logger or generic scheduler paths.
- Add any provider service tests for payload construction/failure mapping.

### Integration Webhooks

- Webhook setup/registration for providers is not implemented yet.
- Keep TODOs in provider dispatcher/function code where delivery-confirmed
  completion will be added later.
- Future direction: provider-owned integration webhook routes that can
  self-register provider webhooks (for example Resend create-webhook API).

## Validation Commands

```bash
pnpm --filter @integrations/core run typecheck
pnpm --filter @integrations/<name> run typecheck
pnpm --filter @scheduling/api run typecheck
```

## Current Integrations

- `svix` (registered in API at `apps/api/src/services/integrations/svix.ts`)
- `logger` (`integrations/logger/src/index.ts`)
