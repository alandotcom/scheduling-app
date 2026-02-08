// oRPC client setup for connecting to the API server

import type { Router } from "@scheduling/api/router-type";
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["ui", "api"]);

// Construct the absolute URL for the RPC endpoint
// Use window.location.origin in browser, fallback to localhost for SSR
const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/v1`;
  }
  return "http://localhost:3000/v1";
};

// Create the RPC link with fetch configuration
const link = new RPCLink({
  url: getBaseUrl(),
  method: () => "POST", // Always use POST - server doesn't allow GET for procedures
  headers: () => ({}),
  fetch: async (request, init) => {
    try {
      const response = await globalThis.fetch(request, {
        ...init,
        credentials: "include", // Include cookies for session auth
      });
      if (!response.ok) {
        void logger.warn`API error: ${response.status}`;
      }
      return response;
    } catch (error) {
      // Don't log AbortError - these are expected when React Query cancels requests
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      void logger.error`API request failed: ${error}`;
      throw error;
    }
  },
});

// Create the typed oRPC client
export const api: RouterClient<Router> = createORPCClient(link);
