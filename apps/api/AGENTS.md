# API Testing Notes

This file is focused on testing guidance for `apps/api`.

## Documentation

Use these as canonical implementation references:

- `docs/ARCHITECTURE.md`
- `docs/guides/journey-engine-domain-events.md`
- `docs/guides/journey-execution-lifecycle.md`
- `docs/plans/README.md`

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

### DB Reset Strategy (Selective)

- API test preload initializes a shared test DB, but it does **not** auto-reset per test.
- Any test file that uses `getTestDb()` must call `registerDbTestReset()` once in that file/suite.
- Prefer `registerDbTestReset("per-file")` when each test builds its own isolated fixtures (for example, fresh org-scoped data) and does not depend on global table emptiness.
- Use `registerDbTestReset()` (`per-test`) for stateful suites that assert global counts/uniqueness or otherwise fail under per-file isolation.
- Do not add global reset hooks in preload files; keep reset registration local to DB test files.

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
