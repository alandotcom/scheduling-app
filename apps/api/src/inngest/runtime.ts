import { config } from "../config.js";

export class InngestRuntimeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InngestRuntimeError";
    this.status = status;
  }
}

function resolveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length > 0
  ) {
    return error.message;
  }

  return fallbackMessage;
}

export async function cancelInngestRunById(runId: string): Promise<void> {
  const baseUrl = config.inngest.baseUrl;
  if (!baseUrl) {
    throw new InngestRuntimeError(
      "INNGEST_BASE_URL must be configured to cancel workflow runs",
      400,
    );
  }

  const url = new URL(`/v1/runs/${encodeURIComponent(runId)}/cancel`, baseUrl);
  const headers: Record<string, string> = {};

  if (config.inngest.signingKey) {
    headers["Authorization"] = `Bearer ${config.inngest.signingKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers,
    });
  } catch (error: unknown) {
    throw new InngestRuntimeError(
      resolveErrorMessage(error, "Failed to cancel workflow run in Inngest"),
      500,
    );
  }

  if (response.ok) {
    return;
  }

  throw new InngestRuntimeError(
    `Failed to cancel workflow run in Inngest (status ${response.status})`,
    response.status,
  );
}
