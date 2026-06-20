import { getLogger } from "@logtape/logtape";
import { connect } from "inngest/connect";
import { inngest } from "./client.js";
import { inngestFunctions } from "./functions/index.js";

const logger = getLogger(["api", "inngest"]);

// Outbound persistent connection to the Inngest gateway. Replaces the
// inngest/hono serve() handler — the worker syncs its app + functions over the
// WebSocket, so no inbound /api/inngest endpoint is required.
export async function startInngestWorker() {
  try {
    const connection = await connect({
      apps: [{ client: inngest, functions: inngestFunctions }],
    });
    logger.info("Inngest connect worker established ({state})", {
      state: connection.state,
    });
    return connection;
  } catch (error) {
    logger.error("Inngest connect worker failed to start: {error}", { error });
    return undefined;
  }
}
