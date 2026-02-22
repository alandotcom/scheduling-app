# API Testing Notes

This file is focused on testing guidance for `apps/api`.

## Documentation

Use these as canonical implementation references:

- `docs/ARCHITECTURE.md`
- `docs/guides/journey-engine-domain-events.md`
- `docs/guides/journey-execution-lifecycle.md`
- `PLAN.md`

## Test Stack

- Runtime and test runner: `bun:test`
- Inngest function testing: `@inngest/test` (`InngestTestEngine`)
- Integration/DB testing: real Postgres test database via `@scheduling/db/test-utils`

## Common Commands

```bash
# Run all API tests
pnpm --filter @scheduling/api run test

# Run specific test files
pnpm --filter @scheduling/api run test -- src/inngest/functions/dev-ping.test.ts

# Run two specific test files
pnpm --filter @scheduling/api run test -- src/inngest/functions/dev-ping.test.ts src/services/jobs/emitter.test.ts
```

## Inngest Function Tests

Use `InngestTestEngine` for function-level behavior tests.

```ts
import { InngestTestEngine } from "@inngest/test";
import { myFunction } from "./my-function";

const t = new InngestTestEngine({ function: myFunction });

const { result } = await t.execute({
  events: [{ name: "my/event", data: { orgId: "org-1" } }],
});
```

Recommended minimum coverage for each new function:

1. Full execution test via `execute()`.
2. Targeted checkpoint/step test via `executeStep("step-id")` when useful.
3. Failure-path test for thrown step errors or timeout/cancel paths.

## Event Emitter Tests

For sender modules (for example `services/jobs/emitter.ts`):

1. Mock `inngest.send` using `mock()` from `bun:test`.
2. Assert payload shape (`id`, `name`, `data.orgId`, expected data fields, `ts`).
3. Assert behavior when send fails (errors propagate to callers).

Always restore patched methods in `beforeEach`/`afterEach`.

## Global Inngest Send Guard

API tests preload `src/test-utils/mock-inngest.ts`, which globally patches both
`inngest.send` with a fail-fast mock.

- Any unmocked send attempt fails the test immediately.
- For service tests, inject requester dependencies (for example
  `scheduleResendRequester`) instead of relying on runtime defaults.
- For focused sender unit tests, explicitly override `client.send` in the test
  and restore it in `afterEach`.

## Real DB Integration Tests

Use real Postgres tests when validating repository/service behavior, org scoping, and RLS effects.

Core helpers:

- `createTestDb()`
- `resetTestDb()`
- `closeTestDb()`
- `createOrg()` or other factories in `src/test-utils/`

Keep these tests for behavior that cannot be trusted with pure mocks (query semantics, constraints, RLS).

## Test File Placement

- Prefer co-located tests: `*.test.ts` next to implementation files.
- Keep function tests under `src/inngest/functions/`.
- Keep service tests under their service folder (for example `src/services/...`).

## Local End-to-End Check (Inngest)

When verifying function registration/execution manually:

```bash
pnpm dev:api
pnpm dev:inngest
```

Then confirm:

1. `GET /api/inngest` returns `200`.
2. Inngest dev server reports app sync.
3. Sending a test event triggers the expected function run.
