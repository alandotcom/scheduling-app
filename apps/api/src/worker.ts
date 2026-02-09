// @scheduling/api - background worker process
// Runs BullMQ workers for outbox event processing and webhook publishing.

import process from "node:process";
import {
  configure,
  getConsoleSink,
  getLogger,
  getAnsiColorFormatter,
} from "@logtape/logtape";
import { closeAllQueues } from "./services/jobs/queue.js";
import {
  processStaleOutboxEntries,
  startWorkers,
  stopWorkers,
} from "./services/jobs/worker.js";
import { bootstrapSvixEventCatalogOnStartup } from "./services/svix-event-catalog.js";

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
    { category: ["db"], sinks: ["console"], lowestLevel: "info" },
    {
      category: [],
      sinks: ["console"],
      lowestLevel: isDev ? "debug" : "info",
    },
  ],
});

const logger = getLogger(["worker"]);

await bootstrapSvixEventCatalogOnStartup();

startWorkers();
logger.info("Background workers started");

const staleOutboxIntervalMs = 60_000;
const staleOutboxTimer = setInterval(() => {
  void processStaleOutboxEntries().catch((error) => {
    logger.error(`Failed stale outbox processing run: ${String(error)}`);
  });
}, staleOutboxIntervalMs);

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
for (const signal of shutdownSignals) {
  process.on(signal, () => {
    void (async () => {
      clearInterval(staleOutboxTimer);
      await stopWorkers();
      await closeAllQueues();
      process.exit(0);
    })().catch((error) => {
      logger.error(
        "Failed to shut down worker cleanly during {signal}: {error}",
        {
          signal,
          error,
        },
      );
      process.exit(1);
    });
  });
}
