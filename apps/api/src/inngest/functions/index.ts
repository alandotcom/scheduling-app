import { devPingFunction } from "./dev-ping.js";
import { journeyDeliveryScheduledFunction } from "./journey-delivery-scheduled.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { journeyDomainTriggerFunctions } from "./journey-domain-triggers.js";
import { workflowDomainTriggerFunctions } from "./workflow-domain-triggers.js";
import { workflowRunRequestedFunction } from "./workflow-run-requested.js";

export const inngestFunctions = [
  devPingFunction,
  workflowRunRequestedFunction,
  journeyDeliveryScheduledFunction,
  ...integrationFanoutFunctions,
  ...journeyDomainTriggerFunctions,
  ...workflowDomainTriggerFunctions,
];
