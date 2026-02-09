import {
  webhookEventTypes,
  type WebhookEventData,
  type WebhookEventType,
} from "@scheduling/dto";

export type EventType = WebhookEventType;

export interface DomainEvent<TEventType extends EventType = EventType> {
  id: string;
  type: TEventType;
  orgId: string;
  payload: WebhookEventData<TEventType>;
  timestamp: string;
  attemptNumber?: number;
}

export interface IntegrationBackoffOptions {
  type: "fixed" | "exponential";
  delayMs: number;
}

export interface IntegrationJobOptions {
  attempts?: number;
  backoff?: IntegrationBackoffOptions;
  removeOnComplete?: number;
  removeOnFail?: number;
}

export interface IntegrationConsumer {
  name: string;
  queueName: string;
  supportedEventTypes: readonly (EventType | "*")[];
  concurrency?: number;
  jobOptions?: IntegrationJobOptions;
  process(event: DomainEvent): Promise<void>;
}

export function isEventType(value: string): value is EventType {
  return webhookEventTypes.some((eventType) => eventType === value);
}

export function integrationSupportsEvent(
  integration: IntegrationConsumer,
  eventType: EventType,
): boolean {
  return integration.supportedEventTypes.some(
    (supportedType) => supportedType === "*" || supportedType === eventType,
  );
}
