// oRPC instance setup with context type

import { os, ORPCError } from "@orpc/server";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import {
  ApplicationError,
  type ApplicationErrorCode,
} from "../errors/application-error.js";

// Authentication method used for the request
export type AuthMethod = "session" | "token" | null;

// Context type available in all handlers
export interface Context {
  userId: string | null;
  orgId: string | null;
  sessionId: string | null;
  tokenId: string | null; // API token ID if authenticated via token
  authMethod: AuthMethod;
  role: "owner" | "admin" | "member" | null;
  headers: Headers;
}

// Map ApplicationError codes to oRPC error codes and HTTP status codes
const errorCodeMap: Record<
  ApplicationErrorCode,
  { orpcCode: string; status: number }
> = {
  UNAUTHORIZED: { orpcCode: "UNAUTHORIZED", status: 401 },
  SESSION_EXPIRED: { orpcCode: "UNAUTHORIZED", status: 401 },
  INVALID_TOKEN: { orpcCode: "UNAUTHORIZED", status: 401 },
  FORBIDDEN: { orpcCode: "FORBIDDEN", status: 403 },
  NOT_ORG_MEMBER: { orpcCode: "FORBIDDEN", status: 403 },
  INSUFFICIENT_PERMISSIONS: { orpcCode: "FORBIDDEN", status: 403 },
  NOT_FOUND: { orpcCode: "NOT_FOUND", status: 404 },
  APPOINTMENT_NOT_FOUND: { orpcCode: "NOT_FOUND", status: 404 },
  CALENDAR_NOT_FOUND: { orpcCode: "NOT_FOUND", status: 404 },
  VALIDATION_ERROR: { orpcCode: "BAD_REQUEST", status: 400 },
  BAD_REQUEST: { orpcCode: "BAD_REQUEST", status: 400 },
  INVALID_TIMEZONE: { orpcCode: "BAD_REQUEST", status: 400 },
  INVALID_DATE_RANGE: { orpcCode: "BAD_REQUEST", status: 400 },
  CONFLICT: { orpcCode: "CONFLICT", status: 409 },
  SLOT_UNAVAILABLE: { orpcCode: "CONFLICT", status: 409 },
  RESOURCE_CONFLICT: { orpcCode: "CONFLICT", status: 409 },
  DUPLICATE_ENTRY: { orpcCode: "CONFLICT", status: 409 },
  UNPROCESSABLE_CONTENT: { orpcCode: "UNPROCESSABLE_CONTENT", status: 422 },
  BOOKING_IN_PAST: { orpcCode: "UNPROCESSABLE_CONTENT", status: 422 },
  EXCEEDS_CAPACITY: { orpcCode: "UNPROCESSABLE_CONTENT", status: 422 },
  OUTSIDE_NOTICE_WINDOW: { orpcCode: "UNPROCESSABLE_CONTENT", status: 422 },
  APPOINTMENT_ALREADY_CANCELLED: {
    orpcCode: "UNPROCESSABLE_CONTENT",
    status: 422,
  },
};

// Create the base oRPC instance with context type and error transformer
const osWithContext = os.$context<Context>();

// Error transformer middleware that converts ApplicationError to ORPCError
export const base = osWithContext.use(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ApplicationError) {
      const mapping = errorCodeMap[error.code];
      throw new ORPCError(mapping.orpcCode, {
        message: error.message,
        status: mapping.status,
        data: error.details,
        cause: error,
      });
    }
    throw error;
  }
});

// OpenAPI spec generator for M2M API
export const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});
