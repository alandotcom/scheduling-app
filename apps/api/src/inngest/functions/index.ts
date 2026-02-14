import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";
import { workflowDispatchFunctions } from "./workflow-dispatch.js";
import { workflowExecutionFunction } from "./workflow-execution.js";
import { workflowScheduleDispatchFunction } from "./workflow-schedule-dispatch.js";

export const inngestFunctions = [
  devPingFunction,
  ...integrationFanoutFunctions,
  ...workflowDispatchFunctions,
  workflowScheduleDispatchFunction,
  workflowExecutionFunction,
];
