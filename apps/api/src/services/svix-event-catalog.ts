import { getLogger } from "@logtape/logtape";
import {
  webhookEventEnvelopeSchemaByType,
  webhookEventTypes,
  type WebhookEventType,
} from "@scheduling/dto";
import { forEachAsync } from "es-toolkit/array";
import { z } from "zod";
import { ApiException, Svix } from "svix";
import { config } from "../config.js";

const logger = getLogger(["webhooks", "svix", "catalog"]);
const SVIX_MANAGED_EVENT_DESCRIPTION_SUFFIX =
  " webhook event for scheduling resources (v1 envelope).";

function getSvixEventDescription(eventType: WebhookEventType): string {
  return `${eventType} webhook event for scheduling resources (v1 envelope).`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled webhook event type: ${String(value)}`);
}

function isManagedSchedulingEventTypeDescription(description: string): boolean {
  return description.endsWith(SVIX_MANAGED_EVENT_DESCRIPTION_SUFFIX);
}

async function listManagedEventTypes(
  svix: Svix,
  iterator?: string,
): Promise<Array<{ name: string; description: string }>> {
  const page = await svix.eventType.list({
    includeArchived: true,
    ...(iterator ? { iterator } : {}),
  });

  const currentPage = page.data.map((eventType) => ({
    name: eventType.name,
    description: eventType.description,
  }));

  if (page.done || !page.iterator) {
    return currentPage;
  }

  const nextPage = await listManagedEventTypes(svix, page.iterator);
  return [...currentPage, ...nextPage];
}

function getSvixEventGroupName(eventType: WebhookEventType): string {
  switch (eventType) {
    case "appointment.created":
    case "appointment.updated":
    case "appointment.deleted":
      return "Appointment";
    case "appointment_type.created":
    case "appointment_type.updated":
    case "appointment_type.deleted":
      return "Appointment Type";
    case "calendar.created":
    case "calendar.updated":
    case "calendar.deleted":
      return "Calendar";
    case "resource.created":
    case "resource.updated":
    case "resource.deleted":
      return "Resource";
    case "location.created":
    case "location.updated":
    case "location.deleted":
      return "Location";
    case "client.created":
    case "client.updated":
    case "client.deleted":
      return "Client";
    default:
      return assertNever(eventType);
  }
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

  const canonicalEventTypeNames = new Set<string>(webhookEventTypes);

  await forEachAsync(
    webhookEventTypes,
    async (eventType) => {
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
      } catch (error) {
        if (error instanceof ApiException && error.code === 409) {
          await svix.eventType.update(eventType, eventDefinition);
          logger.debug("Updated Svix event type {eventType}", { eventType });
          return;
        }

        throw error;
      }
    },
    { concurrency: 5 },
  );

  const allEventTypes = await listManagedEventTypes(svix);
  const staleEventTypeNames = allEventTypes
    .filter((eventType) =>
      isManagedSchedulingEventTypeDescription(eventType.description),
    )
    .filter((eventType) => !canonicalEventTypeNames.has(eventType.name))
    .map((eventType) => eventType.name);

  await forEachAsync(
    staleEventTypeNames,
    async (eventTypeName) => {
      try {
        await svix.eventType.delete(eventTypeName, { expunge: true });
        logger.info("Deleted stale Svix event type {eventTypeName}", {
          eventTypeName,
        });
      } catch (error) {
        if (error instanceof ApiException && error.code === 404) {
          return;
        }

        throw error;
      }
    },
    { concurrency: 5 },
  );

  logger.info(
    "Synced {count} Svix event type definitions and pruned {prunedCount} stale managed types",
    {
      count: webhookEventTypes.length,
      prunedCount: staleEventTypeNames.length,
    },
  );
}

export async function bootstrapSvixEventCatalogOnStartup(): Promise<void> {
  if (!config.webhooks.enabled) {
    return;
  }

  await syncSvixEventCatalog();
}
