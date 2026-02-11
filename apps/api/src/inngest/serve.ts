import { serve } from "inngest/hono";
import { config } from "../config.js";
import { inngest } from "./client.js";
import { inngestFunctions } from "./functions/index.js";

export const inngestServeHandler = serve({
  client: inngest,
  functions: inngestFunctions,
  ...(config.inngest.signingKey
    ? { signingKey: config.inngest.signingKey }
    : {}),
  ...(config.inngest.baseUrl ? { baseUrl: config.inngest.baseUrl } : {}),
  ...(config.inngest.serveHost ? { serveHost: config.inngest.serveHost } : {}),
  ...(config.inngest.servePath ? { servePath: config.inngest.servePath } : {}),
});
