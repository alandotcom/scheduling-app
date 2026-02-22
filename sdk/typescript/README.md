# @scheduling/client

TypeScript SDK for the Scheduling REST API (`/api/v1/*`), generated from OpenAPI.

## Install

```bash
pnpm add @scheduling/client
```

## Quick Start

```ts
import { Client } from "@scheduling/client";

const client = new Client({
  baseUrl: "https://api.example.com/api/v1",
  apiKey: "<api-key>",
});
const response = await client.appointments.list();

if (!response.error) {
  console.log(response.data.items);
}
```

`apiKey` and `baseUrl` are required.
You can pass a custom `fetch` implementation if needed; otherwise the SDK uses the runtime's global `fetch`.

## Request Options

Each operation method accepts request options such as:

- `baseUrl`
- `headers`
- `query`, `path`, `body`
- `throwOnError`
- `fetch` (custom fetch implementation)

By default, methods return `responseStyle: "fields"` (`{ data, error, request, response }`).

## Runtime Support

This package is fetch-based and intended to work in:

- Node.js 18+
- Browsers
- Bun
- Deno

If your runtime does not provide `fetch`, pass a custom implementation via options.

## Development

From the repo root:

```bash
pnpm sdk:typescript:generate
```

This will:

1. Export OpenAPI from `apps/api`
2. Normalize known invalid query-array `deepObject` styles to `form`
3. Regenerate `src/generated/*` using Hey API built-in config and postprocessing
