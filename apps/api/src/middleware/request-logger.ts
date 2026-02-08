// HTTP request logging middleware

import { createMiddleware } from "hono/factory";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["api", "http"]);

export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Math.round(performance.now() - start);
  const status = c.res.status;

  if (status >= 500) {
    logger.error(`${method} ${path} ${status} ${duration}ms`);
  } else if (status >= 400) {
    logger.warn(`${method} ${path} ${status} ${duration}ms`);
  } else {
    logger.info(`${method} ${path} ${status} ${duration}ms`);
  }
});
