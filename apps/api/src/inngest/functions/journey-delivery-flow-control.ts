export const JOURNEY_DELIVERY_FLOW_CONTROL = {
  sharedOrgConcurrency: {
    key: '"journey-delivery:" + event.data.orgId',
    scope: "env",
    limit: 20,
  },
  twilioCallbackPerFunctionOrgConcurrency: {
    key: "event.data.orgId",
    scope: "fn",
    limit: 10,
  },
} as const;
