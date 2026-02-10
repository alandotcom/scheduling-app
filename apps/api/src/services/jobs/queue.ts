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
  AnyDomainEvent,
  DomainEvent,
  IntegrationConsumer,
} from "@integrations/core";
import { getValkeyRedisOptions } from "../../lib/redis.js";
import type { JobQueue } from "./types.js";

export type FanoutJobData = {
  eventId: string;
  eventType: AnyDomainEvent["type"];
};

// Queue names
export const QUEUE_NAMES = {
  DISPATCH: "scheduling-events.dispatch",
  FANOUT: "scheduling-events.fanout",
} as const;
const INTEGRATION_QUEUE_PREFIX = "scheduling-events.integration";
const INTEGRATION_WORKER_CONCURRENCY = 1;

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

let dispatchQueue: Queue<AnyDomainEvent> | null = null;
let fanoutQueue: Queue<FanoutJobData> | null = null;
let flowProducer: FlowProducer | null = null;
const integrationQueues = new Map<string, Queue<AnyDomainEvent>>();

function getDefaultIntegrationJobOptions(): JobsOptions {
  return {
    removeOnComplete: 100,
    removeOnFail: 1000,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  };
}

export function getIntegrationQueueName(integrationName: string): string {
  return `${INTEGRATION_QUEUE_PREFIX}.${integrationName}`;
}

// Get or create dispatcher queue.
export function getDispatchQueue(): Queue<AnyDomainEvent> {
  if (!dispatchQueue) {
    dispatchQueue = new Queue<AnyDomainEvent>(QUEUE_NAMES.DISPATCH, {
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
): Queue<AnyDomainEvent> {
  const queueName = getIntegrationQueueName(integration.name);
  const existing = integrationQueues.get(queueName);
  if (existing) {
    return existing;
  }

  const queue = new Queue<AnyDomainEvent>(queueName, {
    connection: connectionOptions,
    defaultJobOptions: getDefaultIntegrationJobOptions(),
  });

  integrationQueues.set(queueName, queue);
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
  event: AnyDomainEvent,
  integrations: readonly IntegrationConsumer[],
): Promise<void> {
  if (integrations.length === 0) {
    return;
  }

  // Ensure integration queues are initialized with shared integration defaults.
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
      queueName: getIntegrationQueueName(integration.name),
      data: event,
      opts: {
        ...getDefaultIntegrationJobOptions(),
        jobId: buildIntegrationChildJobId(event.id, integration.name),
      },
    })),
  });
}

// BullMQ implementation of JobQueue interface for domain dispatch jobs.
export class BullMQJobQueue implements JobQueue {
  private queue: Queue<AnyDomainEvent>;

  constructor() {
    this.queue = getDispatchQueue();
  }

  async enqueue<TEventType extends AnyDomainEvent["type"]>(
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
  processor: (job: Job<AnyDomainEvent>) => Promise<void>,
): Worker<AnyDomainEvent> {
  return new Worker<AnyDomainEvent>(QUEUE_NAMES.DISPATCH, processor, {
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
  processor: (job: Job<AnyDomainEvent>) => Promise<void>,
): Worker<AnyDomainEvent> {
  return new Worker<AnyDomainEvent>(
    getIntegrationQueueName(integration.name),
    processor,
    {
      connection: connectionOptions,
      concurrency: INTEGRATION_WORKER_CONCURRENCY,
    },
  );
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
