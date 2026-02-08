// @scheduling/api - Bull Board server for BullMQ queue visibility

import process from "node:process";
import {
  configure,
  getAnsiColorFormatter,
  getConsoleSink,
  getLogger,
} from "@logtape/logtape";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "hono/bun";
import { Hono } from "hono";
import { config } from "./config.js";
import {
  closeAllQueues,
  getEventQueue,
  getWebhookQueue,
  QUEUE_NAMES,
} from "./services/jobs/queue.js";

const isDev = process.env.NODE_ENV !== "production";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: getAnsiColorFormatter({ timestamp: "time" }),
    }),
  },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
    {
      category: [],
      sinks: ["console"],
      lowestLevel: isDev ? "debug" : "info",
    },
  ],
});

const logger = getLogger(["bull-board"]);

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

const basePath = normalizeBasePath(config.bullBoard.basePath);

const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
  queues: [
    new BullMQAdapter(getEventQueue(), { description: QUEUE_NAMES.EVENTS }),
    new BullMQAdapter(getWebhookQueue(), { description: QUEUE_NAMES.WEBHOOKS }),
  ],
  serverAdapter,
});

serverAdapter.setBasePath(basePath);

const app = new Hono();
app.get("/health", (c) => c.json({ status: "ok" }));
app.route(basePath, serverAdapter.registerPlugin());

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

for (const signal of shutdownSignals) {
  process.on(signal, () => {
    void closeAllQueues()
      .catch((error) => {
        logger.error(
          "Failed closing BullMQ connections during {signal}: {error}",
          { signal, error },
        );
      })
      .finally(() => process.exit(0));
  });
}

export default {
  hostname: config.bullBoard.host,
  port: config.bullBoard.port,
  fetch: app.fetch,
};

logger.info("Bull Board running at {url}", {
  url: `http://${config.bullBoard.host}:${config.bullBoard.port}${basePath}`,
});
