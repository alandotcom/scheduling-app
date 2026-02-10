// Event types for the scheduling system

import {
  type AnyDomainEvent,
  isEventType,
  type DomainEvent,
  type EventType,
} from "@integrations/core";

export { isEventType };
export type { AnyDomainEvent, DomainEvent, EventType };

// Outbox entry status
export type OutboxStatus = "pending" | "processing" | "delivered" | "failed";

// Abstract job queue interface for swapability
export interface JobQueue {
  enqueue<TEventType extends EventType>(
    event: DomainEvent<TEventType>,
  ): Promise<void>;
  close(): Promise<void>;
}
