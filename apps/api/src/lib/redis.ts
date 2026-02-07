import type { RedisOptions } from "ioredis";
import { config } from "../config.js";

function parseRedisUrl(redisUrl: string): RedisOptions {
  const parsedUrl = new URL(redisUrl);

  const dbPath = parsedUrl.pathname.replace(/^\//, "");
  if (dbPath && !/^\d+$/.test(dbPath)) {
    throw new Error("REDIS_URL database path must be a numeric index");
  }

  const options: RedisOptions = {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 6379,
  };

  if (parsedUrl.username) {
    options.username = decodeURIComponent(parsedUrl.username);
  }

  if (parsedUrl.password) {
    options.password = decodeURIComponent(parsedUrl.password);
  }

  if (dbPath) {
    options.db = Number.parseInt(dbPath, 10);
  }

  if (parsedUrl.protocol === "rediss:") {
    options.tls = {};
  }

  return options;
}

const valkeyConnectionOptions: RedisOptions = config.valkey.url
  ? parseRedisUrl(config.valkey.url)
  : {
      host: config.valkey.host,
      port: config.valkey.port,
    };

export function getValkeyRedisOptions(
  overrides: RedisOptions = {},
): RedisOptions {
  return {
    ...valkeyConnectionOptions,
    ...overrides,
  };
}
