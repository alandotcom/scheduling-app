# Integrations Workspace

This workspace contains event-driven integration consumers for the scheduling app.

Each integration package receives the same canonical domain event envelope and decides what to do with it (webhook publish, email send, SMS send, internal sync, etc).

## Current Packages

```text
integrations/
  core/      # Shared integration interfaces/types
  logger/    # Example integration that logs event payloads
```

## Event Flow

1. Domain mutations emit a domain event.
2. Event is written to `event_outbox` (durable).
3. Dispatch worker claims the outbox row and creates a BullMQ fanout flow.
4. One child job is enqueued per enabled integration queue.
5. Each integration worker processes independently with its own retries/backoff.

## Integration Contract

All integrations implement `IntegrationConsumer` from `@integrations/core`.

```ts
import type { IntegrationConsumer } from "@integrations/core";

export const exampleIntegration: IntegrationConsumer = {
  name: "example",
  queueName: "scheduling-events.integration.example",
  supportedEventTypes: ["*"],
  concurrency: 5,
  jobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delayMs: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
  async process(event) {
    // Handle the event.
  },
};
```

## Add a New Integration

1. Create package directory:

   ```bash
   mkdir -p integrations/<name>/src
   ```

2. Add `integrations/<name>/package.json`:
   - Name: `@integrations/<name>`
   - Dependency: `@integrations/core` (workspace)
   - Include standard scripts (`build`, `test`, `typecheck`)

3. Add `integrations/<name>/tsconfig.json` extending root `tsconfig.json`.

4. Implement `src/index.ts` exporting `<name>Integration` as `IntegrationConsumer`.

5. Register it in API registry:
   - Add `@integrations/<name>` dependency in `apps/api/package.json`.
   - Import + append to `allIntegrations` in `apps/api/src/services/integrations/registry.ts`.

6. Add root path alias in `tsconfig.json`:

   ```json
   "@integrations/<name>": ["./integrations/<name>/src/index.ts"]
   ```

7. Enable it in `.env`:

   ```bash
   INTEGRATIONS_ENABLED=svix,logger,<name>
   ```

8. Install + verify:

   ```bash
   pnpm install
   pnpm --filter @integrations/<name> run typecheck
   pnpm --filter @scheduling/api run typecheck
   ```

## Naming Conventions

- Queue name: `scheduling-events.integration.<name>`
- Package name: `@integrations/<name>`
- Export name: `<name>Integration`

## Notes

- Keep integration code transport-focused; do not duplicate domain mutation logic.
- Use idempotent external API calls whenever possible.
- Failures should throw so BullMQ retries according to `jobOptions`.
