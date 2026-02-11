import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { workflowDispatchFunctions } from "./workflow-dispatch.js";
import { workflowExecutionFunction } from "./workflow-execution.js";

export const inngestFunctions = [
  devPingFunction,
  ...integrationFanoutFunctions,
  ...workflowDispatchFunctions,
  workflowExecutionFunction,
];
