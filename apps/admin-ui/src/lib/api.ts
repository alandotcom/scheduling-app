// oRPC client setup for connecting to the API server

import type { Router } from "@scheduling/api/router-type";
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

// Store for the active org ID (can be set by org switcher UI)
let activeOrgId: string | null = null;

export function setActiveOrg(orgId: string | null) {
  activeOrgId = orgId;
}

export function getActiveOrg() {
  return activeOrgId;
}

// Create the RPC link with fetch configuration
const link = new RPCLink({
  url: "/v1",
  method: () => "POST", // Always use POST - server doesn't allow GET for procedures
  headers: () => {
    // Include org context if an org is explicitly selected
    // If not set, API middleware will default to user's first org
    return activeOrgId ? { "X-Org-Id": activeOrgId } : {};
  },
  fetch: (request, init) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: "include", // Include cookies for session auth
    });
  },
});

// Create the typed oRPC client
export const api: RouterClient<Router> = createORPCClient(link);
