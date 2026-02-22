const UNIQUE_CONSTRAINT_VIOLATION = "23505";
const LOCK_NOT_AVAILABLE = "55P03";
const DEADLOCK_DETECTED = "40P01";

type ErrorWithCode = {
  code?: unknown;
  cause?: unknown;
};

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as ErrorWithCode;
  if (typeof candidate.code === "string") {
    return candidate.code;
  }

  if (!candidate.cause || typeof candidate.cause !== "object") {
    return null;
  }

  const cause = candidate.cause as { code?: unknown; errno?: unknown };
  if (typeof cause.code === "string") {
    return cause.code;
  }
  if (typeof cause.errno === "string") {
    return cause.errno;
  }

  return null;
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return getErrorCode(error) === UNIQUE_CONSTRAINT_VIOLATION;
}

export function isRelationWriteContentionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === LOCK_NOT_AVAILABLE || code === DEADLOCK_DETECTED;
}

export function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("constraint" in cause && typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}
