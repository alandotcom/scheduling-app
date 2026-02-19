import { devPingFunction } from "./dev-ping.js";
import { journeyDeliveryScheduledFunction } from "./journey-delivery-scheduled.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { journeyActionSendProviderExecuteFunctions } from "./journey-action-send-provider-execute.js";
import { journeyActionSendTwilioCallbackReceivedFunction } from "./journey-action-send-twilio-callback-received.js";
import { journeyDomainTriggerFunctions } from "./journey-domain-triggers.js";

export const inngestFunctions = [
  devPingFunction,
  ...journeyActionSendProviderExecuteFunctions,
  journeyActionSendTwilioCallbackReceivedFunction,
  journeyDeliveryScheduledFunction,
  ...integrationFanoutFunctions,
  ...journeyDomainTriggerFunctions,
];
