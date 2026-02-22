import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { apiRouter } from "../routes/index.js";

export const OPENAPI_PREFIX = "/api/v1";
export const OPENAPI_DOCS_PATH = "/docs";
export const OPENAPI_SPEC_PATH = "/openapi.json";

export function createOpenApiHandler() {
  return new OpenAPIHandler(apiRouter, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        docsProvider: "scalar",
        docsTitle: "Scheduling API",
        docsPath: OPENAPI_DOCS_PATH,
        specPath: OPENAPI_SPEC_PATH,
        specGenerateOptions: {
          info: {
            title: "Scheduling API",
            version: "1.0.0",
            description: "REST API for appointment scheduling integrations",
          },
          servers: [{ url: OPENAPI_PREFIX }],
          components: {
            securitySchemes: {
              BearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "API Key",
                description: "Use your Better Auth API key as a Bearer token",
              },
              ApiKeyAuth: {
                type: "apiKey",
                in: "header",
                name: "x-api-key",
                description:
                  "Use your Better Auth API key in the x-api-key header",
              },
            },
          },
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        },
      }),
    ],
  });
}
