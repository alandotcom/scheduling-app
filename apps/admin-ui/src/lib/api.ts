// oRPC client setup for connecting to the API server

import type { Router } from "@scheduling/api/router-type";
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["ui", "api"]);
const EXPECTED_AUTH_TRANSITION_MESSAGES = [
  "Authentication required",
  "Active organization required",
] as const;

// Construct the absolute URL for the RPC endpoint
// Use window.location.origin in browser, fallback to localhost for SSR
const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/v1`;
  }
  return "http://localhost:3000/v1";
};

function getApiErrorMessage(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return "";
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  if (
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "";
}

export function isExpectedAuthTransitionErrorPayload(
  status: number,
  payload: unknown,
): boolean {
  if (status !== 401) return false;
  const message = getApiErrorMessage(payload);
  if (!message) return false;

  return EXPECTED_AUTH_TRANSITION_MESSAGES.some((expectedMessage) =>
    message.includes(expectedMessage),
  );
}

async function shouldSuppressApiWarning(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;

  try {
    const payload = await response.clone().json();
    return isExpectedAuthTransitionErrorPayload(response.status, payload);
  } catch {
    return false;
  }
}

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
        const shouldSuppressWarning = await shouldSuppressApiWarning(response);
        if (!shouldSuppressWarning) {
          logger.warn(`API error: ${response.status}`);
        }
      }
      return response;
    } catch (error) {
      // Don't log AbortError - these are expected when React Query cancels requests
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      logger.error(`API request failed: ${String(error)}`);
      throw error;
    }
  },
});

// Create the typed oRPC client
export const api: RouterClient<Router> = createORPCClient(link);
