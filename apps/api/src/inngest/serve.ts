import { serve } from "inngest/hono";
import { inngest } from "./client.js";
import { inngestFunctions } from "./functions/index.js";

// In v4, signingKey / baseUrl / serveOrigin / servePath are configured on the
// Inngest client (see client.ts), so the serve handler only needs the client
// and the function list.
export const inngestServeHandler = serve({
  client: inngest,
  functions: inngestFunctions,
});
