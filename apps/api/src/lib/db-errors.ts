const UNIQUE_CONSTRAINT_VIOLATION = "23505";

export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
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
