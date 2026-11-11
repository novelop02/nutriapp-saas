import { Redis } from "ioredis";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import type { RateLimitStore } from "./rate-limit.js";

// lazyConnect: nothing connects until the first command, so test files that
// never touch Redis do not open a connection
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  commandTimeout: 1_000,
});

redis.on("error", (err: Error) => {
  logger.warn({ err }, "Redis connection error");
});

// INCR + PEXPIRE in one atomic step. The PTTL branch is a safety net: a key
// with no expiry would block that client forever.
const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const hitResultSchema = z.tuple([z.number(), z.number()]);

export const redisRateLimitStore: RateLimitStore = {
  async hit(key, windowMs) {
    const raw = await redis.eval(HIT_SCRIPT, 1, key, windowMs);
    const [count, ttlMs] = hitResultSchema.parse(raw);
    return { count, ttlMs };
  },
};

export async function closeRedis(): Promise<void> {
  if (redis.status === "ready") await redis.quit();
  else redis.disconnect();
}
