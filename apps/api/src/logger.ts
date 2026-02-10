import {
  configureSync,
  getAnsiColorFormatter,
  getConsoleSink,
} from "@logtape/logtape";
import { config } from "./config.js";

const rootLevel = config.logging.level;

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
      lowestLevel: rootLevel,
    },
    {
      category: [],
      sinks: ["console"],
      lowestLevel: rootLevel,
    },
  ],
});
