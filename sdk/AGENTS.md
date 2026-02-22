# SDK Workspace Notes

This file covers guidance for `sdk/*` work, currently `sdk/typescript`.

## Scope

- SDK package path: `sdk/typescript`
- Package name: `@scheduling/client`
- Runtime target: fetch-based client compatible with Node.js and browser runtimes

## Commands

From repo root:

```bash
pnpm sdk:typescript:generate   # Export OpenAPI + generate SDK artifacts
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

From `sdk/typescript`:

```bash
pnpm run generate
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm run test
```

## Generation Rules

- Do not manually edit `sdk/typescript/src/generated/**`.
- Do not manually edit `sdk/typescript/openapi/openapi.json`.
- SDK generation config lives in `sdk/typescript/openapi-ts.config.mjs`.
- SDK OpenAPI export/normalization logic lives in `apps/api/src/scripts/export-openapi-sdk.ts`.

Current generation shape:

- Hey API SDK plugin emits class-based operations under a single `Client` container.
- Hey API postprocessing is configured via `postProcess` in `openapi-ts.config.mjs`.

## Public API Contract

Package root exports are intentionally curated. Keep this surface minimal.

- `Client`
- `createSchedulingClient`
- `CreateSchedulingClientOptions`

Current contract requires:

- `apiKey` (required)
- `baseUrl` (required)

`createSchedulingClient()` and `new Client(...)` should enforce the same required config.

## Runtime Constraints

- SDK runtime code must not depend on Bun-only APIs.
- Use standard Web APIs (`fetch`, `Headers`, etc.) so the SDK runs under Node.
- Default to global `fetch`; allow caller-provided `fetch` override when needed.

## Notes on Strange Generated Names

- Names like `Calendars2` / `Resources2` are generated due to operation group name collisions.
- Avoid hand-editing generated output to rename these.
- If needed, fix at source via operation naming/grouping in OpenAPI export or codegen config.
