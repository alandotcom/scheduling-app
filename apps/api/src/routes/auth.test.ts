import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { Context } from "../lib/orpc.js";
import { me } from "./auth.js";

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90001",
    orgId: null,
    sessionId: "test-session",
    tokenId: null,
    authMethod: "session",
    role: null,
    headers: new Headers(),
    ...overrides,
  };
}

describe("Auth Routes", () => {
  test("me rejects unauthenticated context", async () => {
    const context = createContext({ userId: null });

    await expect(call(me, {}, { context })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("me returns basic auth context when no active org", async () => {
    const context = createContext({
      userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90011",
      orgId: null,
      role: null,
    });

    const result = await call(me, {}, { context });

    expect(result).toEqual({
      userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90011",
      orgId: null,
      role: null,
      org: null,
    });
  });
});
