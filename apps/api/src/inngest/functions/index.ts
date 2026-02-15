import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { workflowDomainTriggerFunctions } from "./workflow-domain-triggers.js";
import { workflowRunRequestedFunction } from "./workflow-run-requested.js";

export const inngestFunctions = [
  devPingFunction,
  workflowRunRequestedFunction,
  ...integrationFanoutFunctions,
  ...workflowDomainTriggerFunctions,
];
