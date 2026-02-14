import { devPingFunction } from "./dev-ping.js";
import { integrationFanoutFunctions } from "./integration-fanout.js";

export const inngestFunctions = [
  devPingFunction,
  ...integrationFanoutFunctions,
];
