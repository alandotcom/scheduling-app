// Event types for the scheduling system

import {
  webhookEventTypes as EVENT_TYPES,
  type WebhookEventData,
  type WebhookEventType,
} from "@scheduling/dto";

export type EventType = WebhookEventType;

export function isEventType(value: string): value is EventType {
  return EVENT_TYPES.some((eventType) => eventType === value);
}

// Event payload structure
export interface DomainEvent<TEventType extends EventType = EventType> {
  id: string;
  type: TEventType;
  orgId: string;
  payload: WebhookEventData<TEventType>;
  timestamp: string;
  attemptNumber?: number;
}

// Outbox entry status
export type OutboxStatus = "pending" | "processing" | "delivered" | "failed";

// Abstract job queue interface for swapability
export interface JobQueue {
  enqueue<TEventType extends EventType>(
    event: DomainEvent<TEventType>,
  ): Promise<void>;
  close(): Promise<void>;
}
