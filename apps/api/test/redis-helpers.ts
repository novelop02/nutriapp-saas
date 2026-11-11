import { env } from "../src/config/env.js";
import { redis } from "../src/lib/redis.js";

export async function clearRateLimitKeys(): Promise<void> {
  // Tests delete keys: only allowed on the dedicated Redis database 1
  if (new URL(env.REDIS_URL).pathname !== "/1") {
    throw new Error(
      "Tests only clear rate limit keys on Redis database 1 (REDIS_URL ending in /1)",
    );
  }
  const keys = await redis.keys("rl:*");
  if (keys.length > 0) await redis.del(...keys);
}
