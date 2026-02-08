import { isCancelledError } from "@tanstack/react-query";

const ACTIVE_ORGANIZATION_REQUIRED = "Active organization required";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string") {
      return message;
    }
  }
  return "";
}

export function isQueryCancelledError(error: unknown): boolean {
  return isCancelledError(error);
}

export function isActiveOrganizationRequiredError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes(ACTIVE_ORGANIZATION_REQUIRED);
}

export function isIgnorableRouteLoaderError(error: unknown): boolean {
  return (
    isQueryCancelledError(error) || isActiveOrganizationRequiredError(error)
  );
}

export async function swallowIgnorableRouteLoaderError<T>(
  promise: Promise<T>,
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    if (isIgnorableRouteLoaderError(error)) return undefined;
    throw error;
  }
}
