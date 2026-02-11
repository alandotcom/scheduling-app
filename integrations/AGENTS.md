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

## Validation Commands

```bash
pnpm --filter @integrations/core run typecheck
pnpm --filter @integrations/<name> run typecheck
pnpm --filter @scheduling/api run typecheck
```

## Current Integrations

- `svix` (registered in API at `apps/api/src/services/integrations/svix.ts`)
- `logger` (`integrations/logger/src/index.ts`)
