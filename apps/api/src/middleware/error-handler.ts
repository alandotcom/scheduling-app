// Global error handler middleware

import { createMiddleware } from "hono/factory";
import { ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import { getLogger } from "@logtape/logtape";
import { ApplicationError } from "../errors/application-error.js";

const logger = getLogger(["api", "error"]);
type ErrorHttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

// Map error codes to HTTP status codes
const errorStatusMap: Record<string, ErrorHttpStatus> = {
  // Authentication (401)
  UNAUTHORIZED: 401,
  SESSION_EXPIRED: 401,
  INVALID_TOKEN: 401,

  // Authorization (403)
  FORBIDDEN: 403,
  NOT_ORG_MEMBER: 403,
  INSUFFICIENT_PERMISSIONS: 403,

  // Not Found (404)
  NOT_FOUND: 404,
  APPOINTMENT_NOT_FOUND: 404,
  CALENDAR_NOT_FOUND: 404,

  // Validation (400)
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  INVALID_TIMEZONE: 400,
  INVALID_DATE_RANGE: 400,

  // Conflict (409)
  CONFLICT: 409,
  SLOT_UNAVAILABLE: 409,
  RESOURCE_CONFLICT: 409,
  DUPLICATE_ENTRY: 409,

  // Business Logic (422)
  UNPROCESSABLE_CONTENT: 422,
  BOOKING_IN_PAST: 422,
  EXCEEDS_CAPACITY: 422,
  OUTSIDE_NOTICE_WINDOW: 422,
  APPOINTMENT_ALREADY_CANCELLED: 422,
};

function logServerError(
  method: string,
  path: string,
  code: string,
  error: unknown,
): void {
  logger.error(
    "Handled error returned 500 for {method} {path} (code={code}): {error}",
    {
      method,
      path,
      code,
      error,
    },
  );
}

export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const method = c.req.method;
    const path = c.req.path;

    if (error instanceof ApplicationError) {
      const status = errorStatusMap[error.code] ?? 500;
      if (status === 500) {
        logServerError(method, path, error.code, error);
      }
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        status,
      );
    }

    if (error instanceof ORPCError) {
      const status = errorStatusMap[error.code] ?? 500;
      if (status === 500) {
        logServerError(method, path, error.code, error);
      }
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.data,
          },
        },
        status,
      );
    }

    if (error instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: z.treeifyError(error),
          },
        },
        400,
      );
    }

    logger.error("Unhandled error for {method} {path}: {error}", {
      method,
      path,
      error,
    });
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      },
      500,
    );
  }
});
