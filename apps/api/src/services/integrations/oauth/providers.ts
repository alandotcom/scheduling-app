import type { AppIntegrationKey } from "@scheduling/dto";
import { config } from "../../../config.js";
import { isRecord } from "../../../lib/type-guards.js";

export interface OAuthTokenExchangeResult {
  secrets: Record<string, string>;
  configPatch: Record<string, unknown>;
}

export interface OAuthProviderDefinition {
  integrationKey: AppIntegrationKey;
  isConfigured(): boolean;
  buildAuthorizeUrl(input: { state: string }): URL;
  exchangeCode(input: { code: string }): Promise<OAuthTokenExchangeResult>;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

const slackProvider: OAuthProviderDefinition = {
  integrationKey: "slack",
  isConfigured() {
    return Boolean(
      config.integrations.oauth.slack.clientId &&
        config.integrations.oauth.slack.clientSecret &&
        config.integrations.oauth.slack.redirectUri,
    );
  },
  buildAuthorizeUrl(input) {
    const clientId = config.integrations.oauth.slack.clientId;
    const redirectUri = config.integrations.oauth.slack.redirectUri;
    if (!clientId || !redirectUri) {
      throw new Error("Slack OAuth is not configured");
    }

    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", config.integrations.oauth.slack.scopes);
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", redirectUri);
    return url;
  },
  async exchangeCode(input) {
    const clientId = config.integrations.oauth.slack.clientId;
    const clientSecret = config.integrations.oauth.slack.clientSecret;
    const redirectUri = config.integrations.oauth.slack.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Slack OAuth is not configured");
    }

    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: input.code,
        redirect_uri: redirectUri,
      }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Slack OAuth token exchange returned invalid JSON");
    }

    if (!response.ok || !isRecord(payload) || payload["ok"] !== true) {
      const providerError =
        isRecord(payload) && typeof payload["error"] === "string"
          ? payload["error"]
          : `http_${response.status}`;
      throw new Error(`Slack OAuth token exchange failed: ${providerError}`);
    }

    const accessToken = toOptionalString(payload["access_token"]);
    if (!accessToken) {
      throw new Error("Slack OAuth token exchange did not return access token");
    }

    const refreshToken = toOptionalString(payload["refresh_token"]);
    const scope =
      toOptionalString(payload["scope"]) ??
      config.integrations.oauth.slack.scopes;
    const tokenType = toOptionalString(payload["token_type"]);
    const botUserId = toOptionalString(payload["bot_user_id"]);

    const team =
      isRecord(payload["team"]) && payload["team"] !== null
        ? payload["team"]
        : null;
    const teamId = team ? toOptionalString(team["id"]) : null;
    const teamName = team ? toOptionalString(team["name"]) : null;
    const accountLabel = teamName ?? teamId ?? null;

    const expiresInSeconds =
      typeof payload["expires_in"] === "number" &&
      Number.isFinite(payload["expires_in"])
        ? payload["expires_in"]
        : null;
    const accessTokenExpiresAt =
      expiresInSeconds !== null
        ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        : null;

    const connectedAt = new Date().toISOString();
    const secrets: Record<string, string> = {
      accessToken,
    };
    if (refreshToken) {
      secrets["refreshToken"] = refreshToken;
    }

    return {
      secrets,
      configPatch: {
        oauth: {
          connectedAt,
          accountLabel,
          scope,
          tokenType,
          accessTokenExpiresAt,
          teamId,
          teamName,
          botUserId,
        },
      },
    };
  },
};

const oauthProviderByIntegrationKey = new Map<
  AppIntegrationKey,
  OAuthProviderDefinition
>([[slackProvider.integrationKey, slackProvider]]);

export function getOAuthProviderByIntegrationKey(
  key: AppIntegrationKey,
): OAuthProviderDefinition | null {
  return oauthProviderByIntegrationKey.get(key) ?? null;
}
