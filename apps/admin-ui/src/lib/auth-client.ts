// Better Auth React client for authentication

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin, // Uses same origin, proxied by Vite in dev
});

export type Session = typeof authClient.$Infer.Session;
