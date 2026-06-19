import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { journeyActionSendTwilioCallbackReceivedFunction } from "./journey-action-send-twilio-callback-received.js";
import { journeyDomainTriggerFunctions } from "./journey-domain-triggers.js";
import { journeyRunFunction } from "./journey-run.js";

export const inngestFunctions = [
  devPingFunction,
  journeyActionSendTwilioCallbackReceivedFunction,
  ...integrationFanoutFunctions,
  ...journeyDomainTriggerFunctions,
  journeyRunFunction,
];
