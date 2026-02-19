// HTTP request logging middleware

import { createMiddleware } from "hono/factory";
import { getLogger } from "@logtape/logtape";
import { isRecord } from "../lib/type-guards.js";

const logger = getLogger(["api", "http"]);
const SERVER_TIMING_HEADER = "Server-Timing";
const isDev = process.env.NODE_ENV !== "production";
const JSON_CONTENT_TYPE = "application/json";

type RequestLoggerLike = {
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  info(message: string): void;
};

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

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractErrorSummaryFromRecord(
  payload: Record<string, unknown>,
): ErrorSummary | null {
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

    const directSummary = extractErrorSummaryFromRecord(payload);
    if (directSummary) {
      return directSummary;
    }

    const wrappedJsonPayload = payload["json"];
    if (!isRecord(wrappedJsonPayload)) {
      return null;
    }

    return extractErrorSummaryFromRecord(wrappedJsonPayload);
  } catch {
    return null;
  }
}

function buildLogMessage(errorSummary: ErrorSummary | null): string {
  return errorSummary
    ? "{method} {path} {status} {duration}ms (code={errorCode}, message={errorMessage})"
    : "{method} {path} {status} {duration}ms (no structured error payload)";
}

function buildLogData(
  method: string,
  path: string,
  status: number,
  duration: number,
  errorSummary: ErrorSummary | null,
) {
  return {
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
  };
}

export function createRequestLogger(
  requestLoggerImpl: RequestLoggerLike = logger,
) {
  return createMiddleware(async (c, next) => {
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

    if (status >= 400) {
      const errorSummary = await extractErrorSummary(c.res);
      const message = buildLogMessage(errorSummary);
      const data = buildLogData(method, path, status, duration, errorSummary);

      if (status >= 500) {
        requestLoggerImpl.error(message, data);
      } else {
        requestLoggerImpl.warn(message, data);
      }
    } else {
      requestLoggerImpl.info(`${method} ${path} ${status} ${duration}ms`);
    }
  });
}

export const requestLogger = createRequestLogger();
