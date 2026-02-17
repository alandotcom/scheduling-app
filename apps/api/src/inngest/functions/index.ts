import { devPingFunction } from "./dev-ping.js";
import { journeyDeliveryScheduledFunction } from "./journey-delivery-scheduled.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { journeyActionSendResendExecuteFunction } from "./journey-action-send-resend-execute.js";
import { journeyActionSendSlackExecuteFunction } from "./journey-action-send-slack-execute.js";
import { journeyDomainTriggerFunctions } from "./journey-domain-triggers.js";

export const inngestFunctions = [
  devPingFunction,
  journeyActionSendResendExecuteFunction,
  journeyActionSendSlackExecuteFunction,
  journeyDeliveryScheduledFunction,
  ...integrationFanoutFunctions,
  ...journeyDomainTriggerFunctions,
];
