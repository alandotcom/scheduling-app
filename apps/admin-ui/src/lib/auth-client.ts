// Better Auth React client for authentication

import { createAuthClient } from "better-auth/react";
import { apiKeyClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin, // Uses same origin, proxied by Vite in dev
  plugins: [organizationClient(), apiKeyClient()],
});

export type Session = typeof authClient.$Infer.Session;
