import { describe, expect, test } from "bun:test";
import server from "./index.js";

describe("OpenAPI + Scalar docs", () => {
  test("serves OpenAPI JSON with API key security schemes", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/v1/openapi.json"),
    );

    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      openapi?: string;
      info?: { title?: string };
      paths?: Record<string, unknown>;
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
    };

    expect(spec.openapi).toBeDefined();
    expect(spec.info?.title).toBe("Scheduling API");
    expect(spec.paths?.["/locations"]).toBeDefined();
    expect(spec.components?.securitySchemes?.["BearerAuth"]).toBeDefined();
    expect(spec.components?.securitySchemes?.["ApiKeyAuth"]).toBeDefined();
  });

  test("serves Scalar docs page", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/v1/docs"),
    );

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("text/html");

    const html = (await response.text()).toLowerCase();
    expect(html).toContain("scalar");
  });
});
