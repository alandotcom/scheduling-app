// Rate limiting middleware using Valkey (Redis-compatible)
// Uses sliding window algorithm for accurate rate limiting

import { createMiddleware } from "hono/factory";
import { Redis } from "ioredis";
import { getValkeyRedisOptions } from "../lib/redis.js";

// Lazy-initialize Redis client
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(
      getValkeyRedisOptions({
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          // Stop retrying after 3 attempts
          if (times > 3) return null;
          return Math.min(times * 100, 1000);
        },
      }),
    );
    // Handle connection errors gracefully
    redis.on("error", (err) => {
      console.error("Redis connection error:", err.message);
    });
  }
  return redis;
}

// Rate limit configuration
export interface RateLimitConfig {
  // Maximum requests per window
  limit: number;
  // Window size in seconds
  windowSeconds: number;
  // Key prefix for Redis
  keyPrefix?: string;
  // Skip rate limiting for certain conditions
  skip?: (c: any) => boolean;
}

// Default rate limits
export const RATE_LIMITS = {
  // API tokens: 1000 requests per minute
  token: {
    limit: 1000,
    windowSeconds: 60,
    keyPrefix: "rl:token",
  },
  // Session auth: 600 requests per minute
  session: {
    limit: 600,
    windowSeconds: 60,
    keyPrefix: "rl:session",
  },
  // Unauthenticated: 60 requests per minute per IP
  anonymous: {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: "rl:anon",
  },
} as const;

// Get rate limit key based on auth method
function getRateLimitKey(c: any): { key: string; config: RateLimitConfig } {
  const authMethod = c.get("authMethod");
  const tokenId = c.get("tokenId");
  const sessionId = c.get("sessionId");

  if (authMethod === "token" && tokenId) {
    // Rate limit by token ID
    return {
      key: `${RATE_LIMITS.token.keyPrefix}:${tokenId}`,
      config: RATE_LIMITS.token,
    };
  }

  if (authMethod === "session" && sessionId) {
    // Rate limit by session ID
    return {
      key: `${RATE_LIMITS.session.keyPrefix}:${sessionId}`,
      config: RATE_LIMITS.session,
    };
  }

  // Anonymous: rate limit by IP
  const ip =
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    "unknown";

  return {
    key: `${RATE_LIMITS.anonymous.keyPrefix}:${ip}`,
    config: RATE_LIMITS.anonymous,
  };
}

// Sliding window rate limiter using Redis
async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Use a sorted set to track requests
  // Score = timestamp, Value = unique request ID
  const multi = redis.multi();

  // Remove old entries outside the window
  multi.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  multi.zcard(key);

  // Add current request
  multi.zadd(key, now.toString(), `${now}:${Math.random()}`);

  // Set expiry on the key
  multi.expire(key, windowSeconds);

  const results = await multi.exec();

  if (!results) {
    // Redis error - allow request but log
    console.error("Rate limit check failed: Redis returned null");
    return { allowed: true, remaining: limit, resetAt: now + windowMs };
  }

  const currentCount = (results[1]?.[1] as number) || 0;

  // We check before adding, so if currentCount >= limit, deny
  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + windowMs,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - currentCount - 1),
    resetAt: now + windowMs,
  };
}

// Create rate limiting middleware
export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  // Skip rate limiting for health checks
  if (c.req.path === "/v1/health") {
    return next();
  }

  const { key, config: limitConfig } = getRateLimitKey(c);

  try {
    const redis = getRedis();
    const { allowed, remaining, resetAt } = await checkRateLimit(
      redis,
      key,
      limitConfig.limit,
      limitConfig.windowSeconds,
    );

    // Set rate limit headers
    c.header("X-RateLimit-Limit", limitConfig.limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());

    if (!allowed) {
      c.header("Retry-After", limitConfig.windowSeconds.toString());
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
          },
        },
        429,
      );
    }
  } catch (error) {
    // If Redis is unavailable, allow the request but log
    console.error("Rate limiting error:", error);
    // Continue without rate limiting rather than blocking all requests
  }

  return next();
});

// Graceful shutdown
export async function closeRateLimiter(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
