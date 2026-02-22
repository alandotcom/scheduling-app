import { createClient, createConfig, mergeHeaders } from "./generated/client";
import { Client as GeneratedClient } from "./generated/sdk.gen";

export type CreateSchedulingClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit;
};

/**
 * Create a configured SDK client without manually wiring `createClient()`.
 * Uses the runtime's global fetch by default.
 */
export function createSchedulingClient(
  options: CreateSchedulingClientOptions,
): Client {
  return new Client(options);
}

export class Client extends GeneratedClient {
  constructor(options: CreateSchedulingClientOptions) {
    const headers = mergeHeaders(options.headers, {
      "x-api-key": options.apiKey,
    });

    const httpClient = createClient(
      createConfig({
        baseUrl: options.baseUrl,
        headers,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
    );

    super({ client: httpClient });
  }
}
