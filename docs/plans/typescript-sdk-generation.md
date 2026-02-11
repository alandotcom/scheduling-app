# TypeScript SDK Generation

## Goal

Create a publishable external TypeScript SDK for the M2M API (`/api/v1/*`) without changing the internal oRPC client flow used by admin UI.

## Current API Context

1. Internal UI uses oRPC and shared router types (`/v1/*`).
2. External integrations use OpenAPI/REST (`/api/v1/*`).
3. OpenAPI spec is already served at `/api/v1/openapi.json`.

## TypeScript SDK Options

1. Keep internal-only oRPC typed client
   - Best for monorepo consumers.
   - Not suitable as an external published SDK.
2. OpenAPI types-only generation
   - Generate TS types and hand-write HTTP calls.
   - Lightweight, but more manual maintenance.
3. OpenAPI full SDK generation with OSS tooling
   - Generate methods + types from OpenAPI.
   - Best fit for external TypeScript package.
4. Hosted generator vendors
   - Strong SDK platform features, but adds vendor dependency and cost.

## Decision

Use option 3 with Hey API.

1. Package location: `sdk/typescript` (workspace path under `sdk/*`).
2. Package name: `@scheduling/client`.
3. Source of truth: build-time OpenAPI export script, then generate from file.
4. SDK shape: generated methods + generated types.
5. Runtime target: fetch-based universal client (browser + Node 18+ + Bun + Deno).
6. Git policy: commit generated SDK code and committed OpenAPI artifact.
7. Webhook consumer utilities ship in the same package via `@scheduling/client/webhooks`.
8. Webhook event schemas/types are bundled into SDK artifacts (not imported from private `@scheduling/dto` at runtime by SDK consumers).
9. Webhook helper scope for v1 is framework-agnostic core APIs first (framework adapters deferred).

## Proposed Layout

```txt
sdk/
  typescript/
    package.json
    tsconfig.json
    openapi/
      openapi.json
    src/
      generated/
      index.ts
```

## Planned Workflow

1. Export OpenAPI spec from `apps/api` into `sdk/typescript/openapi/openapi.json`.
2. Run Hey API generation into `sdk/typescript/src/generated`.
3. Sync/generate webhook schema artifacts into the SDK package from the canonical webhook DTO definitions.
4. Build and typecheck `@scheduling/client`.
5. Publish package.

## Webhook Consumer Support (Svix)

Webhook handling support will be part of the same external SDK package, exposed via subpath export:

- `@scheduling/client/webhooks`

Why this shape:

1. Single package for integrators (REST client + webhook handling).
2. Shared versioning for API client and webhook event contracts.
3. Less publishing/release overhead than splitting a second package in v1.

## Research Findings (Svix)

1. Signature verification must use the raw request body (string/bytes), not parsed JSON.
2. Verification uses `svix-id`, `svix-timestamp`, and `svix-signature` headers.
3. Svix docs also mention support for white-labeled `webhook-*` header prefixes in supported libraries.
4. Replay protection requires timestamp tolerance checks (official libraries enforce this behavior).
5. Consumer endpoints should ack quickly with `2xx` and do heavier processing asynchronously.
6. Consumers should be idempotent because retries can occur; key off `event.id` and/or `svix-id`.

## Planned SDK Webhook API (v1)

Planned exports under `@scheduling/client/webhooks`:

1. `verifyWebhookSignature(...)`
2. `parseWebhookEvent(...)`
3. `verifyAndParseWebhook(...)`
4. `handleWebhookEvent(...)`

Planned types:

1. `WebhookEventType`
2. `WebhookEventEnvelope`
3. `WebhookEventDataByType`
4. `WebhookVerificationError`
5. `WebhookPayloadValidationError`

Envelope contract (aligned with current domain event payloads):

- `id`
- `type`
- `orgId`
- `timestamp`
- `data`

## CI/Quality Gates

1. Fail CI if exported spec is stale.
2. Fail CI if generated SDK output is stale.
3. Fail CI if webhook schema artifacts are stale.
4. Run SDK typecheck/build in CI before publish.

## Webhook Test Scenarios (Planned)

1. Valid signature and raw payload verification succeeds.
2. Missing or invalid Svix headers fail verification.
3. Timestamp skew outside tolerance is rejected.
4. Payload schema mismatch fails parsing.
5. Idempotent processing guidance validated with duplicate delivery simulation (`event.id` / `svix-id`).
6. Header prefix compatibility works for both `svix-*` and `webhook-*`.

## Non-Goals

1. No SDK generation for internal oRPC routes (`/v1/*`).
2. No multi-language SDKs in this phase.
3. No separate repo for SDK in this phase.

## Non-Goals (Webhook v1)

1. No framework-specific adapters (Next.js, Express, Hono) in v1.
2. No separate `@scheduling/webhooks` package in v1.
3. No inbound webhook endpoint implementation in this phase (SDK consumer utilities only).

## Sources

1. https://docs.svix.com/receiving/verifying-payloads/how
2. https://docs.svix.com/receiving/verifying-payloads/how-manual
3. https://docs.svix.com/receiving/verifying-payloads/why
4. https://docs.svix.com/documenting-webhooks
5. https://www.svix.com/guides/receiving/receive-webhooks-with-typescript/
