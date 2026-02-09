import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { Context } from "../lib/orpc.js";
import { integrationRoutes } from "./integrations.js";

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90001",
    orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
    sessionId: "test-session",
    tokenId: null,
    authMethod: "session",
    role: "owner",
    headers: new Headers(),
    ...overrides,
  };
}

describe("Integration Routes", () => {
  test("list rejects unauthenticated requests", async () => {
    const context = createContext({ userId: null, role: null, orgId: null });

    await expect(
      call(integrationRoutes.list, undefined as never, { context }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("list rejects non-admin roles", async () => {
    const context = createContext({ role: "member" });

    await expect(
      call(integrationRoutes.list, undefined as never, { context }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
