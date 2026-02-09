export type WebhookTab = "endpoints" | "catalog" | "logs";

export type AttemptFilter = "all" | "succeeded" | "failed";

export interface WebhooksRouteState {
  webhookTab?: string;
  endpointId?: string;
  messageId?: string;
  attemptFilter?: string;
}

export interface WebhooksRouteActions {
  goToEndpoints: () => void;
  goToEndpoint: (endpointId: string) => void;
  goToMessage: (messageId: string) => void;
  goToTab: (tab: WebhookTab) => void;
  setAttemptFilter: (filter: AttemptFilter) => void;
}
