import { devPingFunction } from "./dev-ping.js";
import { journeyDeliveryScheduledFunction } from "./journey-delivery-scheduled.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { journeyDomainTriggerFunctions } from "./journey-domain-triggers.js";

export const inngestFunctions = [
  devPingFunction,
  journeyDeliveryScheduledFunction,
  ...integrationFanoutFunctions,
  ...journeyDomainTriggerFunctions,
];
