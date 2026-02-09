import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import { ApiException, Svix } from "svix";
import { orgs } from "@scheduling/db/schema";
import type { WebhookEventData } from "@scheduling/dto";
import { config } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { db } from "../lib/db.js";
import type { EventType } from "./jobs/types.js";

const logger = getLogger(["webhooks", "svix"]);
const APP_PORTAL_ACCESS_TTL_SECONDS = 60 * 60;

let svixClient: Svix | null = null;
const appIdByOrgId = new Map<string, string>();

function isWebhooksEnabled(): boolean {
  return config.webhooks.enabled;
}

function getSvixClient(): Svix {
  if (!isWebhooksEnabled()) {
    throw new ApplicationError("Webhooks are disabled", {
      code: "BAD_REQUEST",
    });
  }

  if (!config.webhooks.authToken) {
    throw new ApplicationError("SVIX_AUTH_TOKEN is not configured", {
      code: "BAD_REQUEST",
    });
  }

  if (!svixClient) {
    const options: {
      requestTimeout: number;
      retryScheduleInMs: number[];
      serverUrl?: string;
    } = {
      requestTimeout: 30_000,
      // Let BullMQ own retry behavior.
      retryScheduleInMs: [],
    };
    if (config.webhooks.baseUrl) {
      options.serverUrl = config.webhooks.baseUrl;
    }

    svixClient = new Svix(config.webhooks.authToken, options);
  }

  return svixClient;
}

async function getOrgName(orgId: string): Promise<string> {
  const [org] = await db
    .select({ name: orgs.name })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);

  if (!org) {
    throw new ApplicationError("Organization not found", {
      code: "NOT_FOUND",
    });
  }

  return org.name;
}

export function getSvixErrorStatusCode(error: unknown): number | null {
  if (error instanceof ApiException) {
    return error.code;
  }

  return null;
}

export function isSvixConflictError(error: unknown): boolean {
  return getSvixErrorStatusCode(error) === 409;
}

export function isRetriableSvixError(error: unknown): boolean {
  const statusCode = getSvixErrorStatusCode(error);
  if (statusCode === null) {
    return true;
  }

  return statusCode === 429 || statusCode >= 500;
}

export async function ensureSvixAppForOrg(
  orgId: string,
): Promise<string | null> {
  if (!isWebhooksEnabled()) {
    return null;
  }

  const cachedAppId = appIdByOrgId.get(orgId);
  if (cachedAppId) {
    return cachedAppId;
  }

  const svix = getSvixClient();
  const orgName = await getOrgName(orgId);

  const app = await svix.application.getOrCreate({
    uid: orgId,
    name: orgName,
    metadata: {
      orgId,
    },
  });

  appIdByOrgId.set(orgId, app.id);
  return app.id;
}

export interface PublishWebhookEventInput<
  TEventType extends EventType = EventType,
> {
  eventId: string;
  eventType: TEventType;
  orgId: string;
  payload: WebhookEventData<TEventType>;
  occurredAt: string;
}

export async function publishWebhookEvent<TEventType extends EventType>(
  input: PublishWebhookEventInput<TEventType>,
): Promise<void> {
  if (!isWebhooksEnabled()) {
    logger.debug(
      "Webhook publishing disabled, skipping {eventType} ({eventId})",
      {
        eventId: input.eventId,
        eventType: input.eventType,
      },
    );
    return;
  }

  const appId = await ensureSvixAppForOrg(input.orgId);
  if (!appId) {
    return;
  }

  const svix = getSvixClient();
  await svix.message.create(
    appId,
    {
      eventId: input.eventId,
      eventType: input.eventType,
      payload: {
        id: input.eventId,
        type: input.eventType,
        orgId: input.orgId,
        timestamp: input.occurredAt,
        data: input.payload,
      },
      tags: [`org:${input.orgId}`],
    },
    {
      // Idempotent message creation in Svix.
      idempotencyKey: input.eventId,
    },
  );
}

export interface AppPortalSession {
  appId: string;
  token: string;
  serverUrl?: string;
  expiresInSeconds: number;
}

export async function createAppPortalSession(
  orgId: string,
  sessionId?: string | null,
): Promise<AppPortalSession> {
  const appId = await ensureSvixAppForOrg(orgId);
  if (!appId) {
    throw new ApplicationError("Webhooks are disabled", {
      code: "BAD_REQUEST",
    });
  }

  const svix = getSvixClient();
  const appPortalAccessInput: {
    expiry: number;
    sessionId?: string | null;
  } = {
    expiry: APP_PORTAL_ACCESS_TTL_SECONDS,
  };
  if (sessionId) {
    appPortalAccessInput.sessionId = sessionId;
  }

  const access = await svix.authentication.appPortalAccess(
    appId,
    appPortalAccessInput,
  );

  return {
    appId,
    token: access.token,
    ...(config.webhooks.baseUrl ? { serverUrl: config.webhooks.baseUrl } : {}),
    expiresInSeconds: APP_PORTAL_ACCESS_TTL_SECONDS,
  };
}
