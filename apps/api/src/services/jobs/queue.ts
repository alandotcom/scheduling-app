// BullMQ queue setup with Valkey connection

import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { getValkeyRedisOptions } from "../../lib/redis.js";
import type { DomainEvent, JobQueue } from "./types.js";

// Queue names
export const QUEUE_NAMES = {
  EVENTS: "scheduling-events",
} as const;

// BullMQ connection options for Valkey
const connectionOptions: ConnectionOptions = {
  ...getValkeyRedisOptions(),
  maxRetriesPerRequest: null,
};

// Event queue for domain events
let eventQueue: Queue<DomainEvent> | null = null;

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

// Graceful shutdown helper
export async function closeAllQueues(): Promise<void> {
  if (eventQueue) {
    await eventQueue.close();
    eventQueue = null;
  }
}
