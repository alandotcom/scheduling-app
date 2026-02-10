// @scheduling/api - Workflow runtime worker process
// Hosts Workflow protocol handlers and starts world polling.

import "./logger.js";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { config } from "./config.js";

if (!Bun.env["WORKFLOW_TARGET_WORLD"]) {
  Bun.env["WORKFLOW_TARGET_WORLD"] = "@workflow/world-postgres";
}
if (!Bun.env["WORKFLOW_POSTGRES_URL"] && Bun.env["DATABASE_URL"]) {
  Bun.env["WORKFLOW_POSTGRES_URL"] = Bun.env["DATABASE_URL"];
}

const logger = getLogger(["workflow-worker"]);
const httpLogger = getLogger(["workflow-worker", "http"]);
const errorLogger = getLogger(["workflow-worker", "error"]);

const WORKFLOW_BUNDLE_BASE = "../.well-known/workflow/v1";
const WORKFLOW_ROUTES = {
  flow: "/.well-known/workflow/v1/flow",
  step: "/.well-known/workflow/v1/step",
  webhook: "/.well-known/workflow/v1/webhook/:token",
} as const;

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];
type RequestHandler = (request: Request) => Response | Promise<Response>;
type WorkflowModule = Record<string, unknown> & {
  default?: unknown;
};

function isRequestHandler(value: unknown): value is RequestHandler {
  return typeof value === "function";
}

async function importWorkflowModule(path: string): Promise<WorkflowModule> {
  const moduleUrl = new URL(path, import.meta.url);

  try {
    return (await import(moduleUrl.href)) as WorkflowModule;
  } catch (error) {
    throw new Error(
      `Failed to load workflow bundle at ${moduleUrl.pathname}. Run "pnpm --filter @scheduling/api run workflow:build".`,
      { cause: error },
    );
  }
}

function getModuleExport(
  module: WorkflowModule,
  method: HttpMethod,
): RequestHandler | null {
  const direct = module[method];
  if (isRequestHandler(direct)) {
    return direct;
  }

  const defaultExport = module.default;
  if (
    defaultExport &&
    typeof defaultExport === "object" &&
    !Array.isArray(defaultExport)
  ) {
    const nested = (defaultExport as Record<string, unknown>)[method];
    if (isRequestHandler(nested)) {
      return nested;
    }
  }

  return null;
}

function requirePostHandler(
  module: WorkflowModule,
  bundleName: string,
): RequestHandler {
  const handler = getModuleExport(module, "POST");
  if (handler) {
    return handler;
  }

  throw new Error(
    `Generated ${bundleName} bundle is missing a POST handler export.`,
  );
}

function getWebhookHandlers(
  module: WorkflowModule,
): Record<HttpMethod, RequestHandler | null> {
  return Object.fromEntries(
    HTTP_METHODS.map((method) => [method, getModuleExport(module, method)]),
  ) as Record<HttpMethod, RequestHandler | null>;
}

const flowBundle = await importWorkflowModule(
  `${WORKFLOW_BUNDLE_BASE}/flow.js`,
);
const stepBundle = await importWorkflowModule(
  `${WORKFLOW_BUNDLE_BASE}/step.js`,
);
const webhookBundle = await importWorkflowModule(
  `${WORKFLOW_BUNDLE_BASE}/webhook.js`,
);

const flowPostHandler = requirePostHandler(flowBundle, "flow");
const stepPostHandler = requirePostHandler(stepBundle, "step");
const webhookHandlers = getWebhookHandlers(webhookBundle);

if (!Object.values(webhookHandlers).some(Boolean)) {
  throw new Error("Generated webhook bundle is missing HTTP method handlers.");
}

const app = new Hono();

app.onError((error, c) => {
  errorLogger.error(
    "Unhandled workflow worker error for {method} {path}: {error}",
    {
      method: c.req.method,
      path: c.req.path,
      error,
    },
  );
  return c.text("Internal Server Error", 500);
});

app.use("*", async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const durationMs = Math.round(performance.now() - start);
  const status = c.res.status;

  if (status >= 500) {
    httpLogger.error("{method} {path} {status} {duration}ms", {
      method,
      path,
      status,
      duration: durationMs,
    });
  } else if (status >= 400) {
    httpLogger.warn("{method} {path} {status} {duration}ms", {
      method,
      path,
      status,
      duration: durationMs,
    });
  } else {
    httpLogger.info("{method} {path} {status} {duration}ms", {
      method,
      path,
      status,
      duration: durationMs,
    });
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));
app.post(WORKFLOW_ROUTES.flow, (c) => flowPostHandler(c.req.raw));
app.post(WORKFLOW_ROUTES.step, (c) => stepPostHandler(c.req.raw));
app.all(WORKFLOW_ROUTES.webhook, (c) => {
  const method = c.req.method.toUpperCase() as HttpMethod;
  const handler = webhookHandlers[method];

  if (!handler) {
    return c.body(null, 405);
  }

  return handler(c.req.raw);
});

const { getWorld } = await import("workflow/runtime");
await getWorld().start?.();

logger.info("Workflow world started", {
  targetWorld: Bun.env["WORKFLOW_TARGET_WORLD"] ?? "local",
});

export default {
  hostname: config.workflowWorker.host,
  port: config.workflowWorker.port,
  fetch: app.fetch,
};

logger.info("Workflow worker listening at {url}", {
  url: `http://${config.workflowWorker.host}:${config.workflowWorker.port}`,
});
