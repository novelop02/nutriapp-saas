import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearRateLimitKeys } from "../../test/redis-helpers.js";
import { closeRedis, redis, redisRateLimitStore as store } from "./redis.js";

beforeEach(clearRateLimitKeys);

afterAll(closeRedis);

describe("redisRateLimitStore", () => {
  it("counts hits in the same window and reports the remaining time", async () => {
    const first = await store.hit("rl:test:a", 10_000);
    const second = await store.hit("rl:test:a", 10_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.ttlMs).toBeGreaterThan(0);
    expect(second.ttlMs).toBeLessThanOrEqual(10_000);
  });

  it("keeps keys independent", async () => {
    await store.hit("rl:test:a", 10_000);

    expect((await store.hit("rl:test:b", 10_000)).count).toBe(1);
  });

  it("starts a new window after the key expires", async () => {
    await store.hit("rl:test:window", 150);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((await store.hit("rl:test:window", 150)).count).toBe(1);
  });

  it("does not lose hits under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.hit("rl:test:race", 10_000)),
    );

    expect(new Set(results.map((r) => r.count)).size).toBe(50);
    expect(Math.max(...results.map((r) => r.count))).toBe(50);
  });

  it("always leaves the key with an expiry", async () => {
    await store.hit("rl:test:ttl", 10_000);

    expect(await redis.pttl("rl:test:ttl")).toBeGreaterThan(0);
  });

  it("heals a key that somehow lost its expiry", async () => {
    await redis.set("rl:test:immortal", "5"); // no TTL: would block forever

    const result = await store.hit("rl:test:immortal", 10_000);

    expect(result.count).toBe(6);
    expect(await redis.pttl("rl:test:immortal")).toBeGreaterThan(0);
  });
});
