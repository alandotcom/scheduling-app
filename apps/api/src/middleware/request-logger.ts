// HTTP request logging middleware

import { createMiddleware } from "hono/factory";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["api", "http"]);
const SERVER_TIMING_HEADER = "Server-Timing";
const isDev = process.env.NODE_ENV !== "production";

function appendServerTimingMetric(existing: string | null, metric: string) {
  if (!existing || existing.trim().length === 0) {
    return metric;
  }
  return `${existing}, ${metric}`;
}

export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const durationMs = performance.now() - start;
  const duration = Math.round(durationMs);
  const status = c.res.status;
  if (isDev) {
    const serverTimingMetric = `app;dur=${durationMs.toFixed(2)}`;
    const existingServerTiming = c.res.headers.get(SERVER_TIMING_HEADER);
    c.res.headers.set(
      SERVER_TIMING_HEADER,
      appendServerTimingMetric(existingServerTiming, serverTimingMetric),
    );
  }

  if (status >= 500) {
    logger.error(`${method} ${path} ${status} ${duration}ms`);
  } else if (status >= 400) {
    logger.warn(`${method} ${path} ${status} ${duration}ms`);
  } else {
    logger.info(`${method} ${path} ${status} ${duration}ms`);
  }
});
