// Better Auth React client for authentication

import { createAuthClient } from "better-auth/react";
import { apiKeyClient, organizationClient } from "better-auth/client/plugins";

const getAuthBaseUrl = () => {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && origin !== "null" && /^https?:\/\//.test(origin)) {
      return origin;
    }
  }
  return "http://localhost:5173";
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(), // Uses same origin in browser, localhost fallback in tests
  plugins: [organizationClient(), apiKeyClient()],
});

export type Session = typeof authClient.$Infer.Session;
