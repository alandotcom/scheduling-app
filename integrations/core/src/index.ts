import {
  webhookEventTypes,
  type WebhookEventData,
  type WebhookEventType,
} from "@scheduling/dto";

export type EventType = WebhookEventType;

export interface DomainEvent<TEventType extends EventType> {
  id: string;
  type: TEventType;
  orgId: string;
  payload: WebhookEventData<TEventType>;
  timestamp: string;
  attemptNumber?: number;
}
export type AnyDomainEvent = DomainEvent<EventType>;

export type IntegrationSupportedEventType = EventType | "*";
export type IntegrationName = Lowercase<string>;

export type IntegrationEventTypeFromSupported<
  TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
> = "*" extends TSupportedEventTypes[number]
  ? EventType
  : Extract<TSupportedEventTypes[number], EventType>;
export type IntegrationEvent<
  TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
> = DomainEvent<IntegrationEventTypeFromSupported<TSupportedEventTypes>>;

export interface IntegrationConsumer {
  readonly name: IntegrationName;
  readonly supportedEventTypes: readonly IntegrationSupportedEventType[];
  process(event: AnyDomainEvent): Promise<void>;
}

interface CreateIntegrationInput<
  TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
> {
  name: IntegrationName;
  supportedEventTypes: TSupportedEventTypes;
  process(event: IntegrationEvent<TSupportedEventTypes>): Promise<void>;
}

const INTEGRATION_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function isIntegrationName(value: string): value is IntegrationName {
  return INTEGRATION_NAME_PATTERN.test(value);
}

function validateIntegrationName(name: string): IntegrationName {
  const normalized = name.trim().toLowerCase();
  if (!isIntegrationName(normalized)) {
    throw new Error(
      `Invalid integration name "${name}". Names must match ${INTEGRATION_NAME_PATTERN.source}.`,
    );
  }

  return normalized;
}

function validateSupportedEventTypes(
  supportedEventTypes: readonly string[],
): void {
  if (supportedEventTypes.length === 0) {
    throw new Error("Integration must support at least one event type.");
  }

  for (const eventType of supportedEventTypes) {
    if (eventType !== "*" && !isEventType(eventType)) {
      throw new Error(`Invalid integration event type "${eventType}".`);
    }
  }
}

function integrationSupportsEventType<
  TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
>(
  supportedEventTypes: TSupportedEventTypes,
  eventType: EventType,
): eventType is IntegrationEventTypeFromSupported<TSupportedEventTypes> {
  return supportedEventTypes.some(
    (supportedType) => supportedType === "*" || supportedType === eventType,
  );
}

function isIntegrationEventForSupported<
  TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
>(
  supportedEventTypes: TSupportedEventTypes,
  event: AnyDomainEvent,
): event is IntegrationEvent<TSupportedEventTypes> {
  return integrationSupportsEventType(supportedEventTypes, event.type);
}

export function createIntegration<
  const TSupportedEventTypes extends readonly IntegrationSupportedEventType[],
>(input: CreateIntegrationInput<TSupportedEventTypes>): IntegrationConsumer {
  const name = validateIntegrationName(input.name);
  validateSupportedEventTypes(input.supportedEventTypes);

  const process: IntegrationConsumer["process"] = async (event) => {
    if (!isIntegrationEventForSupported(input.supportedEventTypes, event)) {
      throw new Error(
        `Integration "${name}" received unsupported event type "${event.type}".`,
      );
    }

    await input.process(event);
  };

  const integration: IntegrationConsumer = {
    name,
    supportedEventTypes: Object.freeze([...input.supportedEventTypes]),
    process,
  };

  return Object.freeze(integration);
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
