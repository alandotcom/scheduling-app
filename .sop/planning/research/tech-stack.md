# Technology Stack Research

## Postgres 18 UUID7

Postgres 18 provides native `uuidv7()` function for time-ordered UUIDs.

**Purpose:** Opaque identifiers with natural sort order. NOT for storing business timestamps - those remain in dedicated columns (`start_at`, `created_at`, etc.).

### Usage

```sql
-- Generate UUID7
SELECT uuidv7();
-- Output: 019535d9-3df7-79fb-b466-fa907fa17f9e

-- As column default
CREATE TABLE appointments (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    start_at timestamptz NOT NULL,  -- actual appointment time
    end_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    ...
);
```

### Drizzle v1 Schema

```typescript
import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
```

## oRPC (https://orpc.dev)

Type-safe RPC framework with OpenAPI spec generation.

### Key Features
- End-to-end type safety with automatic completion
- Schema validation via Zod or any standard schema library
- Multiple runtime environments (Node.js 18+, Bun, Deno, Cloudflare Workers)
- Adapters for Hono, Next.js, Express, Fastify, etc.
- Built-in plugins for CORS, compression, request validation

### Hono Integration

```typescript
import { Hono } from 'hono'
import { RPCHandler } from '@orpc/server/fetch'
import { onError } from '@orpc/server'

const app = new Hono()

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: {}
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  await next()
})
```

### OpenAPI Generation

```typescript
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()]
})

const spec = await generator.generate(router, {
  info: { title: 'Scheduling API', version: '1.0.0' }
})
```

### Route Definition

```typescript
export const listAppointments = os
  .route({ method: 'GET', path: '/v1/appointments' })
  .input(z.object({
    calendar_id: z.string().uuid().optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
  }))
  .output(z.array(AppointmentSchema))
  .handler(async ({ input, context }) => {
    // Implementation
  })
```

## standard-env (https://github.com/alandotcom/standard-env)

Type-safe environment configuration parsing with Standard Schema support.

### Key Features
- Full TypeScript support with automatic type inference
- Structured organization into logical groupings
- Works with Zod, Valibot, ArkType, etc.
- Flexible defaults and optional properties
- Zero dependencies

### Usage Example

```typescript
import { envParse } from "standardenv";
import { z } from "zod";

const config = envParse(process.env, {
  server: {
    port: {
      format: z.string().transform(Number),
      default: 3000,
      env: 'PORT'
    }
  },
  db: {
    url: {
      format: z.string(),
      env: 'DATABASE_URL'
    }
  },
  valkey: {
    url: {
      format: z.string(),
      env: 'VALKEY_URL',
      default: 'redis://localhost:6379'
    }
  }
});

// config is fully typed
```

## Drizzle v1 with PGLite

### PGLite for Testing

PGLite is an in-process Postgres implementation that can run in Node.js/Bun without a server.

```typescript
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

const client = new PGlite()
const db = drizzle(client)
```

### Drizzle v1 Changes
- New migration API
- Improved query builder
- Better type inference

## Valkey

Redis-compatible in-memory data store (Redis fork by Linux Foundation).

## Docker Compose Setup (Postgres 18 + Valkey)

```yaml
services:
  postgres:
    image: postgres:18-alpine
    ports:
      - "5433:5432"  # Use 5433 to avoid conflicts
    environment:
      POSTGRES_USER: scheduling
      POSTGRES_PASSWORD: scheduling
      POSTGRES_DB: scheduling
    volumes:
      - postgres-data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8-alpine
    ports:
      - "6380:6379"  # Use 6380 to avoid conflicts
    volumes:
      - valkey-data:/data
    command: valkey-server --appendonly yes

volumes:
  postgres-data:
  valkey-data:
```

## oxlint + oxfmt

Fast linter and formatter written in Rust.

### Setup

```json
// package.json
{
  "scripts": {
    "lint": "oxlint --tsconfig",
    "format": "oxfmt ."
  }
}
```

### Configuration (oxlintrc.json)

```json
{
  "rules": {
    "correctness": "error",
    "perf": "warn",
    "suspicious": "error"
  }
}
```
