import {
  configureSync,
  getAnsiColorFormatter,
  getConsoleSink,
} from "@logtape/logtape";
import { config } from "./config.js";

const rootLevel = config.logging.level;
const dbLevel = config.logging.dbLogLevel;

configureSync({
  sinks: {
    console: getConsoleSink({
      formatter: getAnsiColorFormatter({ timestamp: "time" }),
    }),
  },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
    {
      category: ["db"],
      sinks: ["console"],
      lowestLevel: dbLevel,
    },
    {
      category: [],
      sinks: ["console"],
      lowestLevel: rootLevel,
    },
  ],
});
