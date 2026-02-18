// HTTP request logging middleware

import { createMiddleware } from "hono/factory";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["api", "http"]);
const SERVER_TIMING_HEADER = "Server-Timing";
const isDev = process.env.NODE_ENV !== "production";
const JSON_CONTENT_TYPE = "application/json";

type ErrorSummary = {
  errorCode: string | null;
  errorMessage: string | null;
};

function appendServerTimingMetric(existing: string | null, metric: string) {
  if (!existing || existing.trim().length === 0) {
    return metric;
  }
  return `${existing}, ${metric}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function extractErrorSummary(
  response: Response,
): Promise<ErrorSummary | null> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.toLowerCase().includes(JSON_CONTENT_TYPE)) {
    return null;
  }

  try {
    const payload = await response.clone().json();
    if (!isRecord(payload)) {
      return null;
    }

    const nestedError = payload["error"];
    const nestedErrorObject = isRecord(nestedError) ? nestedError : null;

    const errorCode =
      asNonEmptyString(nestedErrorObject?.["code"]) ??
      asNonEmptyString(payload["code"]);
    const errorMessage =
      asNonEmptyString(nestedErrorObject?.["message"]) ??
      asNonEmptyString(payload["message"]);

    if (!errorCode && !errorMessage) {
      return null;
    }

    return { errorCode, errorMessage };
  } catch {
    return null;
  }
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
    const errorSummary = await extractErrorSummary(c.res);

    logger.error(
      errorSummary
        ? "{method} {path} {status} {duration}ms (code={errorCode}, message={errorMessage})"
        : "{method} {path} {status} {duration}ms (no structured error payload)",
      {
        method,
        path,
        status,
        duration,
        ...(errorSummary
          ? {
              errorCode: errorSummary.errorCode ?? "UNKNOWN",
              errorMessage: errorSummary.errorMessage ?? "Unavailable",
            }
          : {}),
      },
    );
  } else if (status >= 400) {
    logger.warn(`${method} ${path} ${status} ${duration}ms`);
  } else {
    logger.info(`${method} ${path} ${status} ${duration}ms`);
  }
});
