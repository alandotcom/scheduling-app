// BullMQ queue setup with Valkey connection

import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { config } from "../../config.js";
import type { DomainEvent, JobQueue, WebhookDeliveryJob } from "./types.js";

// Queue names
export const QUEUE_NAMES = {
  EVENTS: "scheduling-events",
  WEBHOOKS: "scheduling-webhooks",
} as const;

// BullMQ connection options for Valkey
const connectionOptions: ConnectionOptions = {
  host: config.valkey.host,
  port: config.valkey.port,
  maxRetriesPerRequest: null,
};

// Event queue for domain events
let eventQueue: Queue<DomainEvent> | null = null;

// Webhook delivery queue
let webhookQueue: Queue<WebhookDeliveryJob> | null = null;

// Get or create event queue
export function getEventQueue(): Queue<DomainEvent> {
  if (!eventQueue) {
    eventQueue = new Queue<DomainEvent>(QUEUE_NAMES.EVENTS, {
      connection: connectionOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });
  }
  return eventQueue;
}

// Get or create webhook queue
export function getWebhookQueue(): Queue<WebhookDeliveryJob> {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookDeliveryJob>(QUEUE_NAMES.WEBHOOKS, {
      connection: connectionOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });
  }
  return webhookQueue;
}

// BullMQ implementation of JobQueue interface
export class BullMQJobQueue implements JobQueue {
  private queue: Queue<DomainEvent>;

  constructor() {
    this.queue = getEventQueue();
  }

  async enqueue(event: DomainEvent): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: event.id,
    });
  }

  async close(): Promise<void> {
    if (eventQueue) {
      await eventQueue.close();
      eventQueue = null;
    }
    if (webhookQueue) {
      await webhookQueue.close();
      webhookQueue = null;
    }
  }
}

// Create worker for event processing
export function createEventWorker(
  processor: (job: Job<DomainEvent>) => Promise<void>,
): Worker<DomainEvent> {
  return new Worker<DomainEvent>(QUEUE_NAMES.EVENTS, processor, {
    connection: connectionOptions,
    concurrency: 10,
  });
}

// Create worker for webhook delivery
export function createWebhookWorker(
  processor: (job: Job<WebhookDeliveryJob>) => Promise<void>,
): Worker<WebhookDeliveryJob> {
  return new Worker<WebhookDeliveryJob>(QUEUE_NAMES.WEBHOOKS, processor, {
    connection: connectionOptions,
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 60000, // Max 100 webhook deliveries per minute per org
    },
  });
}

// Graceful shutdown helper
export async function closeAllQueues(): Promise<void> {
  if (eventQueue) {
    await eventQueue.close();
    eventQueue = null;
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
}
