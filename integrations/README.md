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
2. API sends the event to Inngest.
3. Inngest fanout triggers matching integration functions.
4. Each integration handler runs independently with function-level retries.

## Integration Contract

All integrations are created with `createIntegration` from `@integrations/core`.

```ts
import { createIntegration } from "@integrations/core";

export const exampleIntegration = createIntegration({
  name: "example",
  supportedEventTypes: ["*"],
  async process(event) {
    // Handle the event.
  },
});
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

4. Implement `src/index.ts` exporting `<name>Integration` via `createIntegration`.

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

- Package name: `@integrations/<name>`
- Export name: `<name>Integration`
- Inngest function id: `integration-<name>-fanout` (or similarly explicit id)

## Notes

- Keep integration code transport-focused; do not duplicate domain mutation logic.
- Use idempotent external API calls whenever possible.
- Failures should throw so Inngest retries according to function configuration.
