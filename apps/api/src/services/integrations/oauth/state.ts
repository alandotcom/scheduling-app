import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { appIntegrationKeySchema } from "@scheduling/dto";

const oauthStateClaimsSchema = z.object({
  v: z.literal(1),
  provider: appIntegrationKeySchema,
  orgId: z.uuid(),
  userId: z.uuid(),
  returnTo: z.url(),
  nonce: z.string().min(1),
  exp: z.number().int().positive(),
});

export type OAuthStateClaims = z.infer<typeof oauthStateClaimsSchema>;

const DEFAULT_STATE_TTL_SECONDS = 10 * 60;

function computeSignature(input: {
  payload: string;
  signingKey: string;
}): string {
  return createHmac("sha256", input.signingKey)
    .update(input.payload)
    .digest("base64url");
}

export function createOAuthStateToken(input: {
  provider: OAuthStateClaims["provider"];
  orgId: string;
  userId: string;
  returnTo: string;
  signingKey: string;
  ttlSeconds?: number;
}): string {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_STATE_TTL_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims: OAuthStateClaims = {
    v: 1,
    provider: input.provider,
    orgId: input.orgId,
    userId: input.userId,
    returnTo: input.returnTo,
    nonce: randomBytes(16).toString("base64url"),
    exp: nowSeconds + ttlSeconds,
  };

  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const signature = computeSignature({
    payload,
    signingKey: input.signingKey,
  });
  return `${payload}.${signature}`;
}

export function verifyOAuthStateToken(input: {
  token: string;
  signingKey: string;
}): OAuthStateClaims | null {
  const [payload, signature] = input.token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = computeSignature({
    payload,
    signingKey: input.signingKey,
  });
  const received = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (received.length !== expected.length) {
    return null;
  }
  if (!timingSafeEqual(received, expected)) {
    return null;
  }

  let parsedPayload: unknown = null;
  try {
    parsedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }

  const claims = oauthStateClaimsSchema.safeParse(parsedPayload);
  if (!claims.success) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims.data.exp <= nowSeconds) {
    return null;
  }

  return claims.data;
}
