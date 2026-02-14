import { getLogger } from "@logtape/logtape";
import {
  domainEventDataSchemaByType,
  domainEventTypeSchema,
  type DomainEventData,
  type DomainEventType,
} from "@scheduling/dto";
import { z } from "zod";
import { domainEventInngest } from "../../inngest/client.js";

const logger = getLogger(["events", "emitter"]);

function generateEventId(): string {
  return Bun.randomUUIDv7();
}

const domainEventSendPayloadBaseSchema = z.object({
  id: z.string(),
  name: domainEventTypeSchema,
  data: z.looseObject({ orgId: z.string() }),
  ts: z.number(),
});

function isDomainEventSendPayload(
  value: unknown,
): value is Parameters<typeof domainEventInngest.send>[0] {
  const parsed = domainEventSendPayloadBaseSchema.safeParse(value);
  if (!parsed.success) {
    return false;
  }

  const { name, data } = parsed.data;
  const { orgId: _orgId, ...payload } = data;

  return domainEventDataSchemaByType[name].safeParse(payload).success;
}

export async function emitEvent<TEventType extends DomainEventType>(
  orgId: string,
  type: TEventType,
  payload: DomainEventData<TEventType>,
): Promise<string> {
  const eventId = generateEventId();
  const timestampMs = Date.now();

  try {
    const sendPayload = {
      id: eventId,
      name: type,
      data: {
        orgId,
        ...payload,
      },
      ts: timestampMs,
    };

    if (!isDomainEventSendPayload(sendPayload)) {
      throw new Error("Invalid domain event payload shape");
    }

    await domainEventInngest.send(sendPayload);
  } catch (error) {
    logger.error("Failed sending event to Inngest: {error}", {
      error,
      eventId,
      eventType: type,
      orgId,
    });
  }

  return eventId;
}

function createTypedEmitter<TEventType extends DomainEventType>(
  eventType: TEventType,
) {
  return (orgId: string, payload: DomainEventData<TEventType>) =>
    emitEvent(orgId, eventType, payload);
}

type SnakeToCamel<TValue extends string> =
  TValue extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
    : TValue;

type EventTypeToEmitterKey<TEventType extends DomainEventType> =
  TEventType extends `${infer Entity}.${infer Action}`
    ? `${SnakeToCamel<Entity>}${Capitalize<SnakeToCamel<Action>>}`
    : never;

type TypedEmitter<TEventType extends DomainEventType> = (
  orgId: string,
  payload: DomainEventData<TEventType>,
) => Promise<string>;

type EventEmitters = {
  [TEventType in DomainEventType as EventTypeToEmitterKey<TEventType>]: TypedEmitter<TEventType>;
};

export const events: EventEmitters = {
  appointmentCreated: createTypedEmitter("appointment.created"),
  appointmentUpdated: createTypedEmitter("appointment.updated"),
  appointmentCancelled: createTypedEmitter("appointment.cancelled"),
  appointmentRescheduled: createTypedEmitter("appointment.rescheduled"),
  appointmentNoShow: createTypedEmitter("appointment.no_show"),
  calendarCreated: createTypedEmitter("calendar.created"),
  calendarUpdated: createTypedEmitter("calendar.updated"),
  calendarDeleted: createTypedEmitter("calendar.deleted"),
  appointmentTypeCreated: createTypedEmitter("appointment_type.created"),
  appointmentTypeUpdated: createTypedEmitter("appointment_type.updated"),
  appointmentTypeDeleted: createTypedEmitter("appointment_type.deleted"),
  resourceCreated: createTypedEmitter("resource.created"),
  resourceUpdated: createTypedEmitter("resource.updated"),
  resourceDeleted: createTypedEmitter("resource.deleted"),
  locationCreated: createTypedEmitter("location.created"),
  locationUpdated: createTypedEmitter("location.updated"),
  locationDeleted: createTypedEmitter("location.deleted"),
  clientCreated: createTypedEmitter("client.created"),
  clientUpdated: createTypedEmitter("client.updated"),
  clientDeleted: createTypedEmitter("client.deleted"),
};
