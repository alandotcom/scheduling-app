import { createHash } from "node:crypto";
import { config } from "../config.js";

type InngestRunByEvent = {
  run_id?: string;
  runId?: string;
  status?: string;
  run_started_at?: string;
  startedAt?: string;
  ended_at?: string;
  completedAt?: string;
  output?: unknown;
};

export type InngestRunSummary = {
  runId: string;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  output?: unknown;
};

export type InngestFunctionRunHistoryItem = {
  id: string;
  type: string;
  attempt: number;
  createdAt: Date;
  stepName?: string;
  result?: {
    durationMS: number;
    errorCode?: string;
  };
};

export type InngestFunctionRun = {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  output?: unknown;
  history: InngestFunctionRunHistoryItem[];
};

export type InngestRunTraceSpan = {
  spanId: string;
  name: string;
  status: string;
  stepId?: string;
  startedAt: Date | null;
  endedAt: Date | null;
  outputId?: string;
  childrenSpans: InngestRunTraceSpan[];
};

export type InngestRunTrace = {
  status: string;
  trace?: InngestRunTraceSpan;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toRunSummary(value: InngestRunByEvent): InngestRunSummary | null {
  const runId =
    typeof value.run_id === "string"
      ? value.run_id
      : typeof value.runId === "string"
        ? value.runId
        : null;

  if (!runId) {
    return null;
  }

  const startedAt = parseOptionalDate(value.run_started_at ?? value.startedAt);
  const endedAt = parseOptionalDate(value.ended_at ?? value.completedAt);

  return {
    runId,
    status: typeof value.status === "string" ? value.status : "UNKNOWN",
    startedAt,
    endedAt,
    output: value.output,
  };
}

function ensureUrl(pathOrUrl: string): string {
  return pathOrUrl.endsWith("/") ? pathOrUrl.slice(0, -1) : pathOrUrl;
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

function toDeterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  const variant = Number.parseInt(chars[16] ?? "0", 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const normalized = chars.join("");

  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

export function toSyntheticUuid(seed: string): string {
  return toDeterministicUuid(seed);
}

export class InngestRunsClient {
  private readonly baseUrl = ensureUrl(
    config.inngest.baseUrl ?? "https://api.inngest.com",
  );

  private readonly authToken = config.inngest.signingKey ?? null;

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      ...extra,
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  private async requestJson(
    path: string,
    init?: RequestInit,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.buildHeaders(toHeaderRecord(init?.headers)),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Inngest API request failed (${response.status}): ${body}`,
      );
    }

    return await response.json();
  }

  private parseRunByEvent(value: unknown): InngestRunByEvent | null {
    const record = asRecord(value);
    if (!record) {
      return null;
    }

    return {
      ...(typeof record["run_id"] === "string"
        ? { run_id: record["run_id"] }
        : {}),
      ...(typeof record["runId"] === "string"
        ? { runId: record["runId"] }
        : {}),
      ...(typeof record["status"] === "string"
        ? { status: record["status"] }
        : {}),
      ...(typeof record["run_started_at"] === "string"
        ? { run_started_at: record["run_started_at"] }
        : {}),
      ...(typeof record["startedAt"] === "string"
        ? { startedAt: record["startedAt"] }
        : {}),
      ...(typeof record["ended_at"] === "string"
        ? { ended_at: record["ended_at"] }
        : {}),
      ...(typeof record["completedAt"] === "string"
        ? { completedAt: record["completedAt"] }
        : {}),
      ...("output" in record ? { output: record["output"] } : {}),
    };
  }

  async getRunsForEvent(eventId: string): Promise<InngestRunSummary[]> {
    if (!eventId) {
      return [];
    }

    const response = await this.requestJson(
      `/v1/events/${encodeURIComponent(eventId)}/runs`,
    );
    const responseRecord = asRecord(response);
    const data = responseRecord?.["data"];
    const runs = Array.isArray(data)
      ? data
          .map((entry) => this.parseRunByEvent(entry))
          .filter((run): run is InngestRunByEvent => run !== null)
      : [];

    return runs
      .map(toRunSummary)
      .filter((run): run is InngestRunSummary => run !== null)
      .toSorted((left, right) => {
        const leftTime = left.startedAt?.getTime() ?? 0;
        const rightTime = right.startedAt?.getTime() ?? 0;
        return rightTime - leftTime;
      });
  }

  async getLatestRunForEvent(
    eventId: string,
  ): Promise<InngestRunSummary | null> {
    const runs = await this.getRunsForEvent(eventId);
    return runs[0] ?? null;
  }

  async cancelRun(runId: string): Promise<void> {
    if (!runId) {
      throw new Error("Run ID is required for cancellation.");
    }

    const response = await fetch(
      `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}`,
      {
        method: "DELETE",
        headers: this.buildHeaders(),
      },
    );

    if (!response.ok && response.status !== 204) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to cancel Inngest run (${response.status}): ${body}`,
      );
    }
  }

  private async queryGraphQL(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.requestJson("/v0/gql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const responseRecord = asRecord(response);
    if (!responseRecord) {
      throw new Error("Inngest GraphQL returned a non-object response");
    }

    const rawErrors = responseRecord["errors"];
    if (Array.isArray(rawErrors) && rawErrors.length > 0) {
      const firstError = rawErrors[0];
      const firstMessage = asRecord(firstError)?.["message"];
      const first =
        typeof firstMessage === "string"
          ? firstMessage
          : "Unknown GraphQL error";
      throw new Error(`Inngest GraphQL query failed: ${first}`);
    }

    return responseRecord["data"];
  }

  async getFunctionRun(runId: string): Promise<InngestFunctionRun | null> {
    if (!runId) {
      return null;
    }

    const query = `
      query GetFunctionRun($runID: ID!) {
        functionRun(query: { functionRunId: $runID }) {
          id
          status
          startedAt
          finishedAt
          output
          history {
            id
            type
            attempt
            createdAt
            stepName
            result {
              durationMS
              errorCode
            }
          }
        }
      }
    `;

    const payload = await this.queryGraphQL(query, { runID: runId });
    const payloadRecord = asRecord(payload);
    const run = asRecord(payloadRecord?.["functionRun"]);

    const runIdValue = run?.["id"];
    if (!run || typeof runIdValue !== "string") {
      return null;
    }

    const historyItems = Array.isArray(run["history"]) ? run["history"] : [];

    return {
      id: runIdValue,
      status: typeof run["status"] === "string" ? run["status"] : "UNKNOWN",
      startedAt: parseOptionalDate(run["startedAt"]),
      finishedAt: parseOptionalDate(run["finishedAt"]),
      output: parseJsonString(run["output"]),
      history: historyItems
        .map((entry) => {
          const item = asRecord(entry);
          if (
            !item ||
            typeof item["id"] !== "string" ||
            typeof item["type"] !== "string" ||
            typeof item["createdAt"] !== "string"
          ) {
            return null;
          }

          const createdAt = new Date(item["createdAt"]);
          if (Number.isNaN(createdAt.getTime())) {
            return null;
          }

          const mapped: InngestFunctionRunHistoryItem = {
            id: item["id"],
            type: item["type"],
            attempt:
              typeof item["attempt"] === "number" &&
              Number.isFinite(item["attempt"])
                ? item["attempt"]
                : 0,
            createdAt,
          };

          if (
            typeof item["stepName"] === "string" &&
            item["stepName"].length > 0
          ) {
            mapped.stepName = item["stepName"];
          }

          const result = asRecord(item["result"]);
          if (result) {
            const durationMs = result["durationMS"];
            if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
              mapped.result = {
                durationMS: durationMs,
                ...(typeof result["errorCode"] === "string"
                  ? { errorCode: result["errorCode"] }
                  : {}),
              };
            }
          }

          return mapped;
        })
        .filter((item): item is InngestFunctionRunHistoryItem => item !== null)
        .toSorted(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        ),
    };
  }

  async getRunTrace(runId: string): Promise<InngestRunTrace | null> {
    if (!runId) {
      return null;
    }

    const query = `
      query GetTraceRun($runID: String!) {
        run(runID: $runID) {
          status
          trace {
            spanID
            name
            status
            stepID
            startedAt
            endedAt
            outputID
            childrenSpans {
              spanID
              name
              status
              stepID
              startedAt
              endedAt
              outputID
              childrenSpans {
                spanID
                name
                status
                stepID
                startedAt
                endedAt
                outputID
              }
            }
          }
        }
      }
    `;

    const payload = await this.queryGraphQL(query, { runID: runId });
    const payloadRecord = asRecord(payload);
    const run = asRecord(payloadRecord?.["run"]);

    if (!run || typeof run["status"] !== "string") {
      return null;
    }

    const mapSpan = (value: unknown): InngestRunTraceSpan | null => {
      const record = asRecord(value);
      if (!record) {
        return null;
      }

      const spanId = record["spanID"];
      const name = record["name"];
      const status = record["status"];
      if (
        typeof spanId !== "string" ||
        typeof name !== "string" ||
        typeof status !== "string"
      ) {
        return null;
      }

      const rawChildren = Array.isArray(record["childrenSpans"])
        ? record["childrenSpans"]
        : [];

      const childrenSpans = rawChildren
        .map(mapSpan)
        .filter((span): span is InngestRunTraceSpan => span !== null);

      const span: InngestRunTraceSpan = {
        spanId,
        name,
        status,
        startedAt: parseOptionalDate(record["startedAt"]),
        endedAt: parseOptionalDate(record["endedAt"]),
        childrenSpans,
      };

      if (typeof record["stepID"] === "string") {
        span.stepId = record["stepID"];
      }
      if (typeof record["outputID"] === "string") {
        span.outputId = record["outputID"];
      }

      return span;
    };

    const mappedTrace = run["trace"] ? mapSpan(run["trace"]) : null;

    if (!mappedTrace) {
      return {
        status: run["status"],
      };
    }

    return {
      status: run["status"],
      trace: mappedTrace,
    };
  }
}

export const inngestRunsClient = new InngestRunsClient();
