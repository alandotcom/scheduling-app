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

## Assistant AI Evals (Evalite)

LLM-based evaluation tests for the scheduling assistant live in `src/evals/`. They use [Evalite](https://github.com/mattpocock/evalite) (built on Vitest) to exercise tool selection, workflow correctness, response quality, and prompt adherence against a real LLM.

Evals are completely separate from unit tests (`bun:test`). Evalite only processes `.eval.ts` files and runs on Node/Vitest — no conflict with the Bun test runner.

### Commands

```bash
# Run all evals (from repo root or API package)
pnpm eval
pnpm --filter @scheduling/api run eval

# Watch mode — launches evalite dev UI at localhost:3006
pnpm eval:watch
pnpm --filter @scheduling/api run eval:watch

# Swap the model under test (default: google/gemini-2.5-flash)
EVAL_MODEL=anthropic/claude-sonnet-4-20250514 pnpm eval
EVAL_MODEL=openai/gpt-4o pnpm eval
```

The model is resolved as: `EVAL_MODEL` > `ASSISTANT_MODEL` > `google/gemini-2.5-flash`.

### Architecture

| Path | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config (60s timeout, 3 concurrency, tsconfig paths) |
| `src/evals/setup.ts` | Loads root `.env` for API gateway keys |
| `src/evals/task.ts` | Core `runAssistant()` — `generateText` + `wrapAISDKModel` for tracing |
| `src/evals/mock-tools.ts` | All 11 tools with production schemas/descriptions, fixture-based execute |
| `src/evals/fixtures/index.ts` | Canned data (3 clients, 2 calendars, 3 types, 4 appointments, 5 slots) |
| `src/evals/scorers/` | Custom scorers: tool selection, response quality, proposal quality |
| `src/evals/scenarios/*.eval.ts` | Eval scenario files picked up by evalite |

### How Mock Tools Work

`buildMockAssistantTools()` imports the real Zod `inputSchema` and `toolDescriptions` from `src/routes/assistant-defs.ts` — the same definitions used in production. Only the `execute` functions differ: they return fixture data instead of calling services. This ensures zero drift between what the LLM sees in evals vs production.

### Adding New Eval Scenarios

1. Create `src/evals/scenarios/<name>.eval.ts`.
2. Import `evalite` from `"evalite"`, `runAssistant` from `../task.js`, fixtures, and scorers.
3. Define test data with `input` (messages + fixtures) and `expected` values for scorers.
4. Run `pnpm eval` to verify.

### Adding New Scorers

Use `createScorer` from `"evalite"`. Return a score between 0 and 1:

```ts
import { createScorer } from "evalite";
import type { EvalOutput } from "../task.js";

export const myScorer = createScorer<unknown, EvalOutput, MyExpected>({
  name: "My Scorer",
  description: "What it checks",
  scorer: ({ output, expected }) => {
    // Return 0-1 score, or { score, metadata }
    return output.text.length < 200 ? 1 : 0;
  },
});
```

### Eval Storage

Evalite stores run history in `apps/api/.evalite/` (gitignored). This persists across `node_modules` wipes and powers the evalite dev UI's historical comparison view.

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

1. The API log shows `Inngest connect worker established (ACTIVE)`.
2. The Inngest dev server (http://localhost:8288) lists the `scheduling-api` app and its functions (synced over the connection).
3. Sending a test event triggers the expected function run.
