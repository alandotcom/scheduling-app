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

There are two categories of integrations with different setup paths.

### Adding a System Integration

System integrations are event-driven consumers registered in `registry.ts` and enabled globally via the `INTEGRATIONS_ENABLED` env var. They are always-on for the entire deployment.

1. Create workspace package (`integrations/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`).
2. Implement and export `<name>Integration` via `createIntegration`.
3. Add to `apps/api/src/services/integrations/registry.ts` (`allIntegrations` array).
4. Add root tsconfig path alias for `@integrations/<name>`.
5. Add `@integrations/<name>` dependency to `apps/api/package.json`.

### Adding an App-Managed Integration

App-managed integrations are per-org, configurable via admin UI, and defined in `app-managed.ts`.

1. Add key to `packages/dto/src/schemas/integration.ts` (`appIntegrationKeySchema`).
2. Add provider definition in `apps/api/src/services/integrations/app-managed.ts` (config schema, secret schema, auth strategy, metadata).
3. Optionally create `integrations/<name>/` workspace if the consumer is complex.
4. If the integration has a delivery action (journey action node), follow the "Adding Integration Action Nodes" checklist below.

## Adding Integration Action Nodes (Workflow/Journey Runtime)

Use this when adding a new workflow action node backed by an external provider
(for example, `send-sendgrid`).

### Runtime Architecture Rule (Important)

- Integration action nodes must execute through a provider-specific Inngest function.
- Do **not** route integration actions through legacy `journey.delivery.scheduled`.
- Legacy scheduled delivery is logger-only (`apps/api/src/inngest/functions/journey-delivery-scheduled.ts`).
- Provider execute functions are **dynamically generated** from `apps/api/src/services/delivery-provider-registry.ts` — not individual files.

Current providers:
- Resend: `journey.action.send-resend.execute` -> `journey-action-send-resend-execute`
- Slack: `journey.action.send-slack.execute` -> `journey-action-send-slack-execute`
- Twilio: `journey.action.send-twilio.execute` -> `journey-action-send-twilio-execute`
- Logger: `journey.delivery.scheduled` -> `journey-delivery-scheduled` (logger-only, not through provider execute)

### Journey Delivery Concurrency Budgets (Required)

Source of truth is split across two files:
- `apps/api/src/inngest/functions/journey-delivery-flow-control.ts` — shared org concurrency + special per-function entries (logger, twilio callback)
- `apps/api/src/services/delivery-provider-registry.ts` — per-provider `perFunctionConcurrency` specs

All journey delivery executors must include both:
- Shared per-org cross-function budget:
  - `key: '"journey-delivery:" + event.data.orgId'`
  - `scope: "env"`
  - `limit: 20`
- Per-function per-org budget:
  - `scope: "fn"`
  - provider-specific `limit`

Current per-function budgets:

| Function | Scope | Limit |
|----------|-------|-------|
| Shared org (all delivery functions) | `env` | 20 |
| `journey-delivery-scheduled` (logger) | `fn` | 20 |
| `journey-action-send-resend-execute` | `fn` | 10 |
| `journey-action-send-slack-execute` | `fn` | 10 |
| `journey-action-send-twilio-execute` | `fn` | 10 |
| `journey-action-send-twilio-callback-received` | `fn` | 10 |

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

5. Add provider-specific dispatcher and register in provider registry
- Create `apps/api/src/services/integrations/<provider>/delivery.ts` implementing `JourneyDeliveryDispatcher`.
- Add provider entry to `apps/api/src/services/delivery-provider-registry.ts`:
  - `key`, `actionTypes`, `channel`, `eventName`, `functionId`
  - `retries`, `maxDispatchAttempts`, `perFunctionConcurrency`
  - `needsTemplateContext`, `dispatch` function
- Provider execute functions are **auto-generated** from the registry by `apps/api/src/inngest/functions/journey-action-send-provider-execute.ts` — no individual function file needed.
- If the provider uses async callbacks (like Twilio), add a separate callback Inngest function and route.

6. Planner routing
- The planner uses `delivery-provider-registry.ts` (`getProviderForActionType()`) to resolve action types to providers.
- No manual routing changes needed in the planner if the new action type is registered in the provider registry.

7. Tests (required)
- Function test:
  - `apps/api/src/inngest/functions/journey-action-<provider>-execute.test.ts`
  - verify function options and event forwarding.
- Planner tests:
  - assert new action routes through provider-specific scheduler,
  - assert it does not go through slack/logger or generic scheduler paths.
- Add any provider service tests for payload construction/failure mapping.

### Integration Webhooks

- Twilio callbacks ARE implemented:
  - `apps/api/src/services/integrations/twilio/callbacks.ts` — handles Twilio status webhooks
  - `apps/api/src/inngest/functions/journey-action-send-twilio-callback-received.ts` — Inngest function for async callback processing
  - Twilio dispatcher returns `awaitingAsyncCallback: true`, delivery stays in `sent` status until callback confirms
- Other providers (Resend, Slack) do NOT have callback support yet — keep TODOs for those.
- Future direction: provider-owned integration webhook routes that can self-register provider webhooks (for example Resend create-webhook API).

## Validation Commands

```bash
pnpm typecheck:all    # Full uncached type-check (recommended after changes)
pnpm lint             # Lint check
pnpm test             # Run all tests
```

## Current Integrations

### System Integrations

Registered in `registry.ts`, enabled via `INTEGRATIONS_ENABLED` env var:

- `svix` — webhook event publishing to Svix (`apps/api/src/services/integrations/svix.ts`)

### App-Managed Integrations

Defined in `app-managed.ts`, per-org enable/disable via admin UI:

- `logger` — structured event logging (has consumer at `integrations/logger/src/index.ts`)
- `resend` — email delivery (manual auth: `fromEmail` + `apiKey`)
- `slack` — channel messages (OAuth auth: `accessToken`)
- `twilio` — SMS delivery (manual auth: `accountSid`, `authToken`, `messagingServiceSid`)

## Supported Journey Action Types

| Action Type | Provider | Channel | Notes |
|-------------|----------|---------|-------|
| `wait` | (system) | — | Delay between steps |
| `condition` | (system) | — | CEL expression, branches true/false |
| `logger` | Logger | log | Structured log sink |
| `send-resend` | Resend | email | Inline email content |
| `send-resend-template` | Resend | email | Resend template by ID/alias |
| `send-slack` | Slack | slack | Channel message |
| `send-twilio` | Twilio | sms | SMS with template interpolation |

## Key Files Reference

```
apps/api/src/
├── services/
│   ├── delivery-provider-registry.ts       ← Provider specs (source of truth for routing)
│   ├── delivery-dispatch-helpers.ts        ← Shared dispatcher types/utils
│   ├── integrations/
│   │   ├── registry.ts                     ← System integration registration
│   │   ├── app-managed.ts                  ← App-managed integration definitions
│   │   ├── runtime.ts                      ← Per-org enablement + 10s TTL cache
│   │   ├── readiness.ts                    ← Config/secret state resolution
│   │   ├── crypto.ts                       ← AES-256-GCM secret encryption
│   │   ├── svix.ts                         ← Svix system integration consumer
│   │   ├── resend/delivery.ts              ← Resend action dispatcher
│   │   ├── slack/delivery.ts               ← Slack action dispatcher
│   │   ├── twilio/delivery.ts              ← Twilio action dispatcher
│   │   └── twilio/callbacks.ts             ← Twilio async callback handler
│   ├── journey-planner.ts                  ← Domain event → run → deliveries
│   ├── journey-delivery-worker.ts          ← Execute individual deliveries
│   ├── journey-trigger-filters.ts          ← Trigger filter evaluation (CEL)
│   ├── journey-condition-evaluator.ts      ← Condition node evaluation (CEL)
│   ├── journey-run-status.ts               ← Run status aggregation
│   ├── journey-run-artifacts.ts            ← Run events + step logs
│   └── journey-template-context.ts         ← Template variable resolution
├── inngest/
│   ├── client.ts                           ← Event type definitions
│   ├── runtime-events.ts                   ← Event send helpers
│   └── functions/
│       ├── integration-fanout.ts           ← Per-event-type domain event fanout
│       ├── journey-domain-triggers.ts      ← Appointment events → planner
│       ├── journey-delivery-scheduled.ts   ← Logger-only delivery executor
│       ├── journey-action-send-provider-execute.ts  ← Auto-generated provider executors
│       ├── journey-action-send-twilio-callback-received.ts
│       └── journey-delivery-flow-control.ts
integrations/
├── core/src/index.ts                       ← createIntegration(), DomainEvent types
└── logger/src/index.ts                     ← Reference logger integration
```
