// BullMQ queue setup with Valkey connection.

import {
  FlowProducer,
  Queue,
  Worker,
  type Job,
  type JobsOptions,
  type ConnectionOptions,
} from "bullmq";
import type {
  DomainEvent,
  IntegrationConsumer,
  IntegrationJobOptions,
} from "@integrations/core";
import { getValkeyRedisOptions } from "../../lib/redis.js";
import type { JobQueue } from "./types.js";

export type FanoutJobData = {
  eventId: string;
  eventType: DomainEvent["type"];
};

// Queue names
export const QUEUE_NAMES = {
  DISPATCH: "scheduling-events.dispatch",
  FANOUT: "scheduling-events.fanout",
} as const;

// BullMQ connection options for Valkey
const connectionOptions: ConnectionOptions = {
  ...getValkeyRedisOptions(),
  maxRetriesPerRequest: null,
};

const JOB_ID_SEPARATOR = "__";

function sanitizeJobIdPart(value: string): string {
  // BullMQ rejects custom job IDs containing ":".
  return value.replaceAll(":", "_");
}

function buildFanoutParentJobId(eventId: string): string {
  return ["fanout", sanitizeJobIdPart(eventId)].join(JOB_ID_SEPARATOR);
}

function buildIntegrationChildJobId(
  eventId: string,
  integrationName: string,
): string {
  return [sanitizeJobIdPart(eventId), sanitizeJobIdPart(integrationName)].join(
    JOB_ID_SEPARATOR,
  );
}

let dispatchQueue: Queue<DomainEvent> | null = null;
let fanoutQueue: Queue<FanoutJobData> | null = null;
let flowProducer: FlowProducer | null = null;
const integrationQueues = new Map<string, Queue<DomainEvent>>();

function toJobOptions(options?: IntegrationJobOptions): JobsOptions {
  const result: JobsOptions = {
    removeOnComplete: options?.removeOnComplete ?? 100,
    removeOnFail: options?.removeOnFail ?? 1000,
    attempts: options?.attempts ?? 3,
  };

  if (options?.backoff) {
    result.backoff = {
      type: options.backoff.type,
      delay: options.backoff.delayMs,
    };
  }

  return result;
}

// Get or create dispatcher queue.
export function getDispatchQueue(): Queue<DomainEvent> {
  if (!dispatchQueue) {
    dispatchQueue = new Queue<DomainEvent>(QUEUE_NAMES.DISPATCH, {
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

  return dispatchQueue;
}

// Get or create fanout parent queue used by BullMQ flows.
export function getFanoutQueue(): Queue<FanoutJobData> {
  if (!fanoutQueue) {
    fanoutQueue = new Queue<FanoutJobData>(QUEUE_NAMES.FANOUT, {
      connection: connectionOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    });
  }

  return fanoutQueue;
}

function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: connectionOptions,
    });
  }

  return flowProducer;
}

export function getIntegrationQueue(
  integration: IntegrationConsumer,
): Queue<DomainEvent> {
  const existing = integrationQueues.get(integration.queueName);
  if (existing) {
    return existing;
  }

  const queue = new Queue<DomainEvent>(integration.queueName, {
    connection: connectionOptions,
    defaultJobOptions: toJobOptions(integration.jobOptions),
  });

  integrationQueues.set(integration.queueName, queue);
  return queue;
}

export function getQueuesForBullBoard(
  integrations: readonly IntegrationConsumer[],
): Queue[] {
  const queues: Queue[] = [getDispatchQueue(), getFanoutQueue()];

  for (const integration of integrations) {
    queues.push(getIntegrationQueue(integration));
  }

  return queues;
}

export async function enqueueIntegrationFanout(
  event: DomainEvent,
  integrations: readonly IntegrationConsumer[],
): Promise<void> {
  if (integrations.length === 0) {
    return;
  }

  // Ensure integration queues are initialized with per-consumer defaults.
  for (const integration of integrations) {
    getIntegrationQueue(integration);
  }

  await getFlowProducer().add({
    name: `fanout:${event.type}`,
    queueName: QUEUE_NAMES.FANOUT,
    data: {
      eventId: event.id,
      eventType: event.type,
    },
    opts: {
      jobId: buildFanoutParentJobId(event.id),
      removeOnComplete: 100,
      removeOnFail: 1000,
    },
    children: integrations.map((integration) => ({
      name: `${integration.name}:${event.type}`,
      queueName: integration.queueName,
      data: event,
      opts: {
        ...toJobOptions(integration.jobOptions),
        jobId: buildIntegrationChildJobId(event.id, integration.name),
      },
    })),
  });
}

// BullMQ implementation of JobQueue interface for domain dispatch jobs.
export class BullMQJobQueue implements JobQueue {
  private queue: Queue<DomainEvent>;

  constructor() {
    this.queue = getDispatchQueue();
  }

  async enqueue<TEventType extends DomainEvent["type"]>(
    event: DomainEvent<TEventType>,
  ): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: event.id,
    });
  }

  async close(): Promise<void> {
    await closeAllQueues();
  }
}

export function createDispatchWorker(
  processor: (job: Job<DomainEvent>) => Promise<void>,
): Worker<DomainEvent> {
  return new Worker<DomainEvent>(QUEUE_NAMES.DISPATCH, processor, {
    connection: connectionOptions,
    concurrency: 10,
  });
}

export function createFanoutWorker(
  processor: (job: Job<FanoutJobData>) => Promise<void>,
): Worker<FanoutJobData> {
  return new Worker<FanoutJobData>(QUEUE_NAMES.FANOUT, processor, {
    connection: connectionOptions,
    concurrency: 10,
  });
}

export function createIntegrationWorker(
  integration: IntegrationConsumer,
  processor: (job: Job<DomainEvent>) => Promise<void>,
): Worker<DomainEvent> {
  return new Worker<DomainEvent>(integration.queueName, processor, {
    connection: connectionOptions,
    concurrency: integration.concurrency ?? 5,
  });
}

// Graceful shutdown helper
export async function closeAllQueues(): Promise<void> {
  if (dispatchQueue) {
    await dispatchQueue.close();
    dispatchQueue = null;
  }

  if (fanoutQueue) {
    await fanoutQueue.close();
    fanoutQueue = null;
  }

  await Promise.all(
    Array.from(integrationQueues.values(), (queue) => queue.close()),
  );
  integrationQueues.clear();

  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }
}
