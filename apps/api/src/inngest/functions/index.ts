import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { workflowDomainTriggerFunctions } from "./workflow-domain-triggers.js";

export const inngestFunctions = [
  devPingFunction,
  ...integrationFanoutFunctions,
  ...workflowDomainTriggerFunctions,
];
