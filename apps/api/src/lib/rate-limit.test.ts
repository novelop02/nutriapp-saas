import { Writable } from "node:stream";
import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { rateLimit, type RateLimitStore } from "./rate-limit.js";

function memoryStore(ttlMs = 60_000) {
  const counts = new Map<string, number>();
  const store: RateLimitStore = {
    hit: (key) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve({ count, ttlMs });
    },
  };
  return { store, keys: () => [...counts.keys()] };
}

const ok: express.RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

function buildApp(store: RateLimitStore, log = pino({ level: "silent" })) {
  const app = express();
  app.use(pinoHttp({ logger: log }));
  app.get(
    "/limited",
    rateLimit({
      store,
      name: "test",
      limit: 3,
      windowMs: 60_000,
      key: (req) => req.get("x-client") ?? "anon",
    }),
    ok,
  );
  app.get(
    "/skipped",
    rateLimit({ store, name: "skip", limit: 1, windowMs: 1_000, key: () => null }),
    ok,
  );
  app.use(errorHandler);
  return app;
}

describe("rateLimit", () => {
  it("allows requests up to the limit and answers 429 after it", async () => {
    const { store } = memoryStore();
    const app = buildApp(store);

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get("/limited")).status).toBe(200);
    }
    const res = await request(app).get("/limited");

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limited");
    expect(res.get("Retry-After")).toBe("60");
  });

  it("rounds Retry-After up and never sends less than 1 second", async () => {
    const tiny = buildApp(memoryStore(1).store);
    const fractional = buildApp(memoryStore(1_500).store);

    for (let i = 0; i < 3; i++) {
      await request(tiny).get("/limited");
      await request(fractional).get("/limited");
    }

    expect((await request(tiny).get("/limited")).get("Retry-After")).toBe("1");
    expect((await request(fractional).get("/limited")).get("Retry-After")).toBe("2");
  });

  it("keeps a separate budget for each client", async () => {
    const { store } = memoryStore();
    const app = buildApp(store);

    for (let i = 0; i < 4; i++) await request(app).get("/limited").set("x-client", "a");

    expect((await request(app).get("/limited").set("x-client", "a")).status).toBe(429);
    expect((await request(app).get("/limited").set("x-client", "b")).status).toBe(200);
  });

  it("skips limiting when the key function returns null", async () => {
    const app = buildApp(memoryStore().store);

    for (let i = 0; i < 5; i++) {
      expect((await request(app).get("/skipped")).status).toBe(200);
    }
  });

  it("namespaces its keys with the limiter name", async () => {
    const { store, keys } = memoryStore();

    await request(buildApp(store)).get("/limited").set("x-client", "a");

    expect(keys()).toEqual(["rl:test:a"]);
  });

  it("does not reveal the limit or the window in the response", async () => {
    const app = buildApp(memoryStore().store);
    for (let i = 0; i < 3; i++) await request(app).get("/limited");

    const res = await request(app).get("/limited");

    expect(res.body.error.message).toBe("Too many requests, try again later");
    expect(res.body.error.details).toBeUndefined();
  });

  it("fails open when the store breaks, and says so in the log", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("redis down")) };

    const res = await request(buildApp(broken, pino({ level: "info" }, sink))).get("/limited");

    expect(res.status).toBe(200);
    expect(lines.join("")).toContain("rate_limit_store_error");
  });
});
