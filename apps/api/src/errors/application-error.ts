export const applicationErrorCodes = [
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "INVALID_TOKEN",
  "FORBIDDEN",
  "NOT_ORG_MEMBER",
  "INSUFFICIENT_PERMISSIONS",
  "NOT_FOUND",
  "APPOINTMENT_NOT_FOUND",
  "CALENDAR_NOT_FOUND",
  "VALIDATION_ERROR",
  "BAD_REQUEST",
  "INVALID_TIMEZONE",
  "INVALID_DATE_RANGE",
  "CONFLICT",
  "SLOT_UNAVAILABLE",
  "RESOURCE_CONFLICT",
  "DUPLICATE_ENTRY",
  "UNPROCESSABLE_CONTENT",
  "BOOKING_IN_PAST",
  "EXCEEDS_CAPACITY",
  "OUTSIDE_NOTICE_WINDOW",
  "APPOINTMENT_ALREADY_CANCELLED",
] as const;

export type ApplicationErrorCode = (typeof applicationErrorCodes)[number];

export type ApplicationErrorOptions = {
  code: ApplicationErrorCode;
  details?: unknown;
  data?: unknown;
  cause?: unknown;
};

export class ApplicationError extends Error {
  code: ApplicationErrorCode;
  details?: unknown;

  constructor(message: string, options: ApplicationErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ApplicationError";
    this.code = options.code;
    this.details = options.details ?? options.data;
  }
}

export const isApplicationError = (error: unknown): error is ApplicationError =>
  error instanceof ApplicationError;
