import { getLogger } from "@logtape/logtape";
import {
  webhookEventEnvelopeSchemaByType,
  webhookEventTypes,
  type WebhookEventType,
} from "@scheduling/dto";
import { chunk } from "es-toolkit";
import { z } from "zod";
import { ApiException, Svix } from "svix";
import { config } from "../config.js";

const logger = getLogger(["webhooks", "svix", "catalog"]);

function getSvixEventDescription(eventType: WebhookEventType): string {
  return `${eventType} webhook event for scheduling resources (v1 envelope).`;
}

function getSvixEventGroupName(eventType: WebhookEventType): string {
  return eventType.split(".")[0] ?? "misc";
}

function getSvixEventSchemaV1(eventType: WebhookEventType): unknown {
  return z.toJSONSchema(webhookEventEnvelopeSchemaByType[eventType]);
}

export async function syncSvixEventCatalog(): Promise<void> {
  if (!config.webhooks.enabled) {
    logger.debug("Webhook event catalog sync skipped: webhooks disabled");
    return;
  }

  if (!config.webhooks.authToken) {
    throw new Error(
      "SVIX_AUTH_TOKEN is required to sync webhook event catalog",
    );
  }

  const svix = new Svix(
    config.webhooks.authToken,
    config.webhooks.baseUrl
      ? { serverUrl: config.webhooks.baseUrl }
      : undefined,
  );

  const batches = chunk(webhookEventTypes, 5);

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (eventType) => {
        const eventDefinition = {
          name: eventType,
          description: getSvixEventDescription(eventType),
          groupName: getSvixEventGroupName(eventType),
          schemas: {
            v1: getSvixEventSchemaV1(eventType),
          },
        };

        try {
          await svix.eventType.create(eventDefinition);
          logger.info("Created Svix event type {eventType}", { eventType });
          return;
        } catch (error) {
          if (error instanceof ApiException && error.code === 409) {
            await svix.eventType.update(eventType, eventDefinition);
            logger.debug("Updated Svix event type {eventType}", { eventType });
            return;
          }

          throw error;
        }
      }),
    );
  }

  logger.info("Synced {count} Svix event type definitions", {
    count: webhookEventTypes.length,
  });
}

export async function bootstrapSvixEventCatalogOnStartup(): Promise<void> {
  if (!config.webhooks.enabled) {
    return;
  }

  await syncSvixEventCatalog();
}
