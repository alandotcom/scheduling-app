import type { DomainEventDataByType } from "@scheduling/dto";

export type AppointmentLifecycleSnapshot =
  DomainEventDataByType["appointment.scheduled"];

export type AppointmentLifecycleEvent =
  | {
      type: "appointment.scheduled";
      payload: DomainEventDataByType["appointment.scheduled"];
    }
  | {
      type: "appointment.rescheduled";
      payload: DomainEventDataByType["appointment.rescheduled"];
    }
  | {
      type: "appointment.canceled";
      payload: DomainEventDataByType["appointment.canceled"];
    };

export function classifyAppointmentLifecycleEvent(input: {
  previous: AppointmentLifecycleSnapshot | null;
  current: AppointmentLifecycleSnapshot;
}): AppointmentLifecycleEvent | null {
  const { previous, current } = input;

  if (!previous) {
    return {
      type: "appointment.scheduled",
      payload: current,
    };
  }

  if (previous.status !== "cancelled" && current.status === "cancelled") {
    return {
      type: "appointment.canceled",
      payload: current,
    };
  }

  const startTimeChanged = previous.startAt !== current.startAt;
  const timezoneChanged = previous.timezone !== current.timezone;
  if (
    previous.status !== "cancelled" &&
    current.status !== "cancelled" &&
    (startTimeChanged || timezoneChanged)
  ) {
    return {
      type: "appointment.rescheduled",
      payload: {
        ...current,
        previous,
      },
    };
  }

  return null;
}
