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
  getQueuesForBullBoard,
  QUEUE_NAMES,
} from "./services/jobs/queue.js";
import { getEnabledIntegrations } from "./services/integrations/registry.js";

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
const enabledIntegrations = getEnabledIntegrations();
const queues = getQueuesForBullBoard(enabledIntegrations);
const dispatchQueue = queues.at(0);
const fanoutQueue = queues.at(1);
const integrationQueues = queues.slice(2);

if (!dispatchQueue || !fanoutQueue) {
  throw new Error("Failed to initialize BullMQ dispatch/fanout queues");
}

const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
  queues: [
    new BullMQAdapter(dispatchQueue, {
      description: QUEUE_NAMES.DISPATCH,
    }),
    new BullMQAdapter(fanoutQueue, {
      description: QUEUE_NAMES.FANOUT,
    }),
    ...integrationQueues.map(
      (queue) => new BullMQAdapter(queue, { description: queue.name }),
    ),
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
