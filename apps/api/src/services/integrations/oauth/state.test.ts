import { describe, expect, test } from "bun:test";
import { createOAuthStateToken, verifyOAuthStateToken } from "./state.js";

const signingKey = "test-signing-key";

describe("OAuth state tokens", () => {
  test("creates and verifies a valid token", () => {
    const token = createOAuthStateToken({
      provider: "slack",
      orgId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      returnTo: "http://localhost:5173/settings?section=integrations",
      signingKey,
      ttlSeconds: 60,
    });

    const claims = verifyOAuthStateToken({
      token,
      signingKey,
    });

    expect(claims).not.toBeNull();
    expect(claims?.provider).toBe("slack");
    expect(claims?.orgId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(claims?.userId).toBe("550e8400-e29b-41d4-a716-446655440001");
  });

  test("rejects tampered token", () => {
    const token = createOAuthStateToken({
      provider: "slack",
      orgId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      returnTo: "http://localhost:5173/settings?section=integrations",
      signingKey,
    });

    const [payload, signature] = token.split(".");
    const tamperedPayload = `${payload}A`;
    const tamperedToken = `${tamperedPayload}.${signature}`;

    expect(
      verifyOAuthStateToken({
        token: tamperedToken,
        signingKey,
      }),
    ).toBeNull();
  });

  test("rejects expired token", () => {
    const token = createOAuthStateToken({
      provider: "slack",
      orgId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      returnTo: "http://localhost:5173/settings?section=integrations",
      signingKey,
      ttlSeconds: -1,
    });

    expect(
      verifyOAuthStateToken({
        token,
        signingKey,
      }),
    ).toBeNull();
  });
});
