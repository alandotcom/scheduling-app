import { Hono } from "hono";
import { getLogger } from "@logtape/logtape";
import { config } from "../config.js";
import { db, withOrg } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { integrationRepository } from "../repositories/integrations.js";
import {
  getAppManagedIntegrationDefinition,
  isAppManagedIntegrationKey,
} from "../services/integrations/app-managed.js";
import { encryptIntegrationSecrets } from "../services/integrations/crypto.js";
import { ensureAppIntegrationDefaultsForOrg } from "../services/integrations/defaults.js";
import {
  getOAuthProviderByIntegrationKey,
  type OAuthProviderDefinition,
} from "../services/integrations/oauth/providers.js";
import {
  createOAuthStateToken,
  verifyOAuthStateToken,
} from "../services/integrations/oauth/state.js";
import { toConfig } from "../services/integrations/readiness.js";
import { invalidateEnabledIntegrationsForOrgCache } from "../services/integrations/runtime.js";

const logger = getLogger(["integrations", "oauth", "routes"]);

const allowedReturnOrigins = new Set(
  [...config.auth.trustedOrigins.split(","), ...config.cors.origin.split(",")]
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

const defaultReturnOrigin =
  allowedReturnOrigins.values().next().value ?? "http://localhost:5173";

function isAdminRole(
  role: "owner" | "admin" | "member" | null,
): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

function normalizeReturnTo(raw: string | null | undefined): string {
  if (!raw) {
    return `${defaultReturnOrigin}/settings?section=integrations`;
  }

  if (raw.startsWith("/")) {
    return `${defaultReturnOrigin}${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return `${defaultReturnOrigin}/settings?section=integrations`;
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !allowedReturnOrigins.has(parsed.origin)
  ) {
    return `${defaultReturnOrigin}/settings?section=integrations`;
  }

  return parsed.toString();
}

function buildResultRedirectUrl(input: {
  returnTo: string;
  provider: string;
  status: "success" | "error";
  reason?: string;
}): string {
  const url = new URL(input.returnTo);
  url.searchParams.set("integration_oauth", input.status);
  url.searchParams.set("integration_provider", input.provider);
  if (input.reason) {
    url.searchParams.set("integration_reason", input.reason);
  }
  return url.toString();
}

function resolveOAuthIntegration(input: { provider: string }): {
  key: ReturnType<typeof getAppManagedIntegrationDefinition>["key"];
  provider: OAuthProviderDefinition;
} | null {
  if (!isAppManagedIntegrationKey(input.provider)) {
    return null;
  }

  const definition = getAppManagedIntegrationDefinition(input.provider);
  if (definition.authStrategy !== "oauth") {
    return null;
  }

  const provider = getOAuthProviderByIntegrationKey(definition.key);
  if (!provider) {
    return null;
  }

  return { key: definition.key, provider };
}

const integrationOAuthRouter = new Hono();
integrationOAuthRouter.use("*", authMiddleware);

integrationOAuthRouter.get("/:provider/start", async (c) => {
  const providerParam = c.req.param("provider");
  const returnTo = normalizeReturnTo(c.req.query("returnTo"));
  const resolved = resolveOAuthIntegration({ provider: providerParam });
  if (!resolved) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_not_supported",
      }),
      302,
    );
  }

  const userId = c.get("userId");
  const orgId = c.get("orgId");
  const role = c.get("role");
  const authMethod = c.get("authMethod");

  if (authMethod !== "session" || !userId || !orgId || !isAdminRole(role)) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "unauthorized",
      }),
      302,
    );
  }

  const stateSigningKey = config.integrations.oauth.stateSigningKey;
  if (!stateSigningKey) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "oauth_not_configured",
      }),
      302,
    );
  }

  if (!resolved.provider.isConfigured()) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_not_configured",
      }),
      302,
    );
  }

  const state = createOAuthStateToken({
    provider: resolved.key,
    orgId,
    userId,
    returnTo,
    signingKey: stateSigningKey,
  });

  try {
    const authorizeUrl = resolved.provider.buildAuthorizeUrl({ state });
    return c.redirect(authorizeUrl.toString(), 302);
  } catch (error) {
    logger.warn("Failed to build OAuth authorize URL", {
      provider: providerParam,
      error,
    });
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_not_configured",
      }),
      302,
    );
  }
});

integrationOAuthRouter.get("/:provider/callback", async (c) => {
  const providerParam = c.req.param("provider");
  const resolved = resolveOAuthIntegration({ provider: providerParam });
  const fallbackReturnTo = normalizeReturnTo(c.req.query("returnTo"));

  if (!resolved) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo: fallbackReturnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_not_supported",
      }),
      302,
    );
  }

  const stateSigningKey = config.integrations.oauth.stateSigningKey;
  if (!stateSigningKey) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo: fallbackReturnTo,
        provider: providerParam,
        status: "error",
        reason: "oauth_not_configured",
      }),
      302,
    );
  }

  const stateParam = c.req.query("state");
  if (!stateParam) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo: fallbackReturnTo,
        provider: providerParam,
        status: "error",
        reason: "state_missing",
      }),
      302,
    );
  }

  const stateClaims = verifyOAuthStateToken({
    token: stateParam,
    signingKey: stateSigningKey,
  });
  if (!stateClaims) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo: fallbackReturnTo,
        provider: providerParam,
        status: "error",
        reason: "state_invalid",
      }),
      302,
    );
  }

  const returnTo = normalizeReturnTo(stateClaims.returnTo);
  if (stateClaims.provider !== resolved.key) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "state_provider_mismatch",
      }),
      302,
    );
  }

  const providerError = c.req.query("error");
  if (providerError) {
    logger.info("OAuth callback returned provider error", {
      provider: providerParam,
      error: providerError,
    });
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_denied",
      }),
      302,
    );
  }

  const code = c.req.query("code");
  if (!code) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "code_missing",
      }),
      302,
    );
  }

  const userId = c.get("userId");
  const authMethod = c.get("authMethod");
  if (authMethod !== "session" || !userId || userId !== stateClaims.userId) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "session_mismatch",
      }),
      302,
    );
  }

  const membership = await db.query.orgMemberships.findFirst({
    where: {
      orgId: stateClaims.orgId,
      userId: stateClaims.userId,
    },
  });
  if (!membership || !isAdminRole(membership.role)) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "forbidden",
      }),
      302,
    );
  }

  if (!resolved.provider.isConfigured()) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "provider_not_configured",
      }),
      302,
    );
  }

  const pepper = config.integrations.encryptionKey;
  if (!pepper) {
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "encryption_not_configured",
      }),
      302,
    );
  }

  let exchange: Awaited<ReturnType<OAuthProviderDefinition["exchangeCode"]>>;
  try {
    exchange = await resolved.provider.exchangeCode({ code });
  } catch (error) {
    logger.warn("OAuth token exchange failed", {
      provider: providerParam,
      orgId: stateClaims.orgId,
      error,
    });
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "token_exchange_failed",
      }),
      302,
    );
  }

  try {
    await ensureAppIntegrationDefaultsForOrg(stateClaims.orgId);

    await withOrg(stateClaims.orgId, async (tx) => {
      const current = await integrationRepository.findByKey(
        tx,
        stateClaims.orgId,
        resolved.key,
      );
      if (!current) {
        throw new Error("Integration row was not found");
      }

      const currentConfig = toConfig(current.config);
      const nextConfig = {
        ...currentConfig,
        ...exchange.configPatch,
      };

      const encrypted = encryptIntegrationSecrets({
        secrets: exchange.secrets,
        pepper,
      });

      const updated = await integrationRepository.update(
        tx,
        stateClaims.orgId,
        resolved.key,
        {
          enabled: true,
          config: nextConfig,
        },
      );
      if (!updated) {
        throw new Error("Integration row update failed");
      }

      const secretsUpdated = await integrationRepository.updateSecrets(
        tx,
        stateClaims.orgId,
        resolved.key,
        encrypted.secretsEncrypted,
        encrypted.secretSalt,
      );
      if (!secretsUpdated) {
        throw new Error("Integration secrets update failed");
      }
    });

    invalidateEnabledIntegrationsForOrgCache(stateClaims.orgId);
  } catch (error) {
    logger.error("Failed to persist OAuth integration connection", {
      provider: providerParam,
      orgId: stateClaims.orgId,
      error,
    });
    return c.redirect(
      buildResultRedirectUrl({
        returnTo,
        provider: providerParam,
        status: "error",
        reason: "persist_failed",
      }),
      302,
    );
  }

  return c.redirect(
    buildResultRedirectUrl({
      returnTo,
      provider: providerParam,
      status: "success",
    }),
    302,
  );
});

export { integrationOAuthRouter };
