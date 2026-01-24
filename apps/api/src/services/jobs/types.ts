// Event types for the scheduling system

export type AppointmentEventType =
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.no_show'

export type CalendarEventType =
  | 'calendar.created'
  | 'calendar.updated'
  | 'calendar.deleted'

export type AppointmentTypeEventType =
  | 'appointment_type.created'
  | 'appointment_type.updated'
  | 'appointment_type.deleted'

export type ResourceEventType =
  | 'resource.created'
  | 'resource.updated'
  | 'resource.deleted'

export type LocationEventType =
  | 'location.created'
  | 'location.updated'
  | 'location.deleted'

export type EventType =
  | AppointmentEventType
  | CalendarEventType
  | AppointmentTypeEventType
  | ResourceEventType
  | LocationEventType

// Event payload structure
export interface DomainEvent<T = unknown> {
  id: string
  type: EventType
  orgId: string
  payload: T
  timestamp: string
  attemptNumber?: number
}

// Outbox entry status
export type OutboxStatus = 'pending' | 'processing' | 'delivered' | 'failed'

// Abstract job queue interface for swapability
export interface JobQueue {
  enqueue(event: DomainEvent): Promise<void>
  close(): Promise<void>
}

// Webhook delivery job data
export interface WebhookDeliveryJob {
  eventId: string
  eventType: EventType
  orgId: string
  payload: unknown
  webhookUrl?: string
  attemptNumber: number
}
