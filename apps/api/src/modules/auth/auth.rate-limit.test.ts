import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findCookie } from "../../../test/helpers.js";
import { clearRateLimitKeys } from "../../../test/redis-helpers.js";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";
import type { RateLimitStore } from "../../lib/rate-limit.js";
import { closeRedis, redis } from "../../lib/redis.js";

const silent = pino({ level: "silent" });
const app = createApp(silent, { rateLimit: true });

const credentials = { email: "ana@example.com", password: "safe-password-123" };

const login = (body: object) => request(app).post("/auth/login").send(body);
const register = (body: object) => request(app).post("/auth/register").send(body);
const refresh = () => request(app).post("/auth/refresh");

beforeEach(async () => {
  await clearRateLimitKeys();
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
  await closeRedis();
});

describe("login limits", () => {
  it("limits attempts per IP, counting requests that fail validation", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await login({ nope: true })).status).toBe(400);
    }

    const res = await login({ nope: true });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limited");
    const retryAfter = Number(res.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it("locks one account after 10 attempts, even with the right password", async () => {
    await register(credentials);
    const wrong = { ...credentials, password: "wrong-password-999" };

    for (let i = 0; i < 10; i++) {
      expect((await login(wrong)).status).toBe(401);
    }
    const locked = await login(credentials);

    expect(locked.status).toBe(429);
    expect(findCookie(locked, "access_token")).toBeUndefined();
    expect(findCookie(locked, "refresh_token")).toBeUndefined();
  });

  it("does not lock other accounts coming from the same IP", async () => {
    const other = { email: "bob@example.com", password: "another-safe-pass-1" };
    await register(other);

    for (let i = 0; i < 10; i++) {
      await login({ ...credentials, password: "wrong-password-999" });
    }

    expect((await login(other)).status).toBe(200);
  });

  it("never stores the email in Redis", async () => {
    await login({ ...credentials, password: "wrong-password-999" });

    const keys = (await redis.keys("rl:*")).join("|");

    expect(keys).toContain("login-email");
    expect(keys).not.toContain("example.com");
    expect(keys).not.toContain("ana@");
  });
});

describe("register and refresh limits", () => {
  it("limits registrations per IP", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await register({ nope: true })).status).toBe(400);
    }

    expect((await register({ nope: true })).status).toBe(429);
  });

  it("limits refresh attempts per IP", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await refresh()).status).toBe(401);
    }

    expect((await refresh()).status).toBe(429);
  });
});

describe("configuration", () => {
  it("does not limit when disabled (the default in tests)", async () => {
    const plain = createApp(silent);

    for (let i = 0; i < 35; i++) {
      expect((await request(plain).post("/auth/login").send({ nope: true })).status).toBe(400);
    }
  });

  it("keeps login reachable when Redis is down, and logs the failure", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("redis down")) };
    const failing = createApp(pino({ level: "info" }, sink), {
      rateLimit: true,
      rateLimitStore: broken,
    });

    const res = await request(failing).post("/auth/login").send(credentials);

    expect(res.status).toBe(401); // it reached the login: no user exists
    expect(lines.join("")).toContain("rate_limit_store_error");
  });
});
