import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Context } from "../lib/orpc.js";
import { isRecord } from "../lib/type-guards.js";
import {
  createOpenApiHandler,
  OPENAPI_PREFIX,
  OPENAPI_SPEC_PATH,
} from "../lib/openapi.js";

const outputPath = resolve(
  import.meta.dir,
  "../../../../sdk/typescript/openapi/openapi.json",
);

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

type DeepObjectArrayQueryParameter = {
  method: string;
  path: string;
  name: string;
};

function normalizeDeepObjectArrayQueryParam(parameter: unknown): boolean {
  if (!isRecord(parameter)) {
    return false;
  }

  if (parameter["in"] !== "query" || parameter["style"] !== "deepObject") {
    return false;
  }

  const schema = parameter["schema"];
  if (!isRecord(schema) || schema["type"] !== "array") {
    return false;
  }

  parameter["style"] = "form";
  parameter["explode"] = true;
  return true;
}

function normalizeOperationParameters(operation: unknown): number {
  if (!isRecord(operation)) {
    return 0;
  }

  const parameters = operation["parameters"];
  if (!Array.isArray(parameters)) {
    return 0;
  }

  return parameters.reduce(
    (count, parameter) =>
      count + (normalizeDeepObjectArrayQueryParam(parameter) ? 1 : 0),
    0,
  );
}

function normalizeOpenApiSpec(spec: unknown): number {
  if (!isRecord(spec)) {
    return 0;
  }

  let normalizedCount = 0;

  const components = spec["components"];
  if (isRecord(components)) {
    const componentParameters = components["parameters"];
    if (isRecord(componentParameters)) {
      for (const parameter of Object.values(componentParameters)) {
        if (normalizeDeepObjectArrayQueryParam(parameter)) {
          normalizedCount += 1;
        }
      }
    }
  }

  const paths = spec["paths"];
  if (!isRecord(paths)) {
    return normalizedCount;
  }

  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      normalizedCount += normalizeOperationParameters(pathItem[method]);
    }
  }

  return normalizedCount;
}

function collectInvalidDeepObjectArrayQueryParameters(
  spec: unknown,
): DeepObjectArrayQueryParameter[] {
  if (!isRecord(spec)) {
    return [];
  }

  const paths = spec["paths"];
  if (!isRecord(paths)) {
    return [];
  }

  const invalidParameters: DeepObjectArrayQueryParameter[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isRecord(operation)) {
        continue;
      }

      const parameters = operation["parameters"];
      if (!Array.isArray(parameters)) {
        continue;
      }

      for (const parameter of parameters) {
        if (!isRecord(parameter)) {
          continue;
        }

        if (
          parameter["in"] !== "query" ||
          parameter["style"] !== "deepObject"
        ) {
          continue;
        }

        const schema = parameter["schema"];
        if (!isRecord(schema) || schema["type"] !== "array") {
          continue;
        }

        invalidParameters.push({
          method: method.toUpperCase(),
          path,
          name:
            typeof parameter["name"] === "string"
              ? parameter["name"]
              : "<unknown>",
        });
      }
    }
  }

  return invalidParameters;
}

async function exportOpenApiSpec() {
  const openApiHandler = createOpenApiHandler();
  const request = new Request(
    `http://localhost${OPENAPI_PREFIX}${OPENAPI_SPEC_PATH}`,
  );
  const context: Context = {
    userId: null,
    orgId: null,
    sessionId: null,
    tokenId: null,
    authMethod: null,
    role: null,
    headers: request.headers,
  };

  const { matched, response } = await openApiHandler.handle(request, {
    prefix: OPENAPI_PREFIX,
    context,
  });

  if (!matched) {
    throw new Error(
      `OpenAPI handler did not match request path ${OPENAPI_PREFIX}${OPENAPI_SPEC_PATH}`,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to export OpenAPI spec (${response.status} ${response.statusText}): ${body}`,
    );
  }

  const spec = await response.json();
  const normalizedCount = normalizeOpenApiSpec(spec);
  const invalidParameters = collectInvalidDeepObjectArrayQueryParameters(spec);

  if (invalidParameters.length > 0) {
    const details = invalidParameters
      .map((item) => `${item.method} ${item.path} (${item.name})`)
      .join(", ");
    throw new Error(
      `OpenAPI export contains invalid deepObject style for query array parameters: ${details}`,
    );
  }

  const serializedSpec = `${JSON.stringify(spec, null, 2)}\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializedSpec, "utf8");

  console.log(
    `Exported OpenAPI spec to ${outputPath} (normalized ${normalizedCount} query array parameter style value${normalizedCount === 1 ? "" : "s"})`,
  );
}

await exportOpenApiSpec();
