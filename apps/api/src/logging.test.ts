import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireCookieValue } from "../test/helpers.js";
import { createApp } from "./app.js";
import { db, pool } from "./db/client.js";
import { loggerOptions } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { lines, log: pino({ ...loggerOptions, level: "info" }, stream) };
}

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
});

describe("logger redaction", () => {
  it("never writes cookies, passwords or tokens", () => {
    const { lines, log } = captureLogs();

    log.info(
      {
        req: { headers: { cookie: "access_token=SECRET-COOKIE" } },
        body: { password: "SECRET-PASSWORD" },
        session: { refreshToken: "SECRET-REFRESH" },
      },
      "test",
    );

    const out = lines.join("");
    expect(out).not.toContain("SECRET");
    expect(out).toContain("[redacted]");
  });
});

describe("request logging", () => {
  it("adds a request id header and logs the request with that id", async () => {
    const { lines, log } = captureLogs();

    const res = await request(createApp(log)).get("/does-not-exist");

    const id = res.get("X-Request-Id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines.join("")).toContain(id);
  });

  it("never logs session cookies, neither in requests nor in responses", async () => {
    const { lines, log } = captureLogs();
    const app = createApp(log);
    const credentials = { email: "ana@example.com", password: "safe-password-123" };

    await request(app).post("/auth/register").send(credentials);
    const login = await request(app).post("/auth/login").send(credentials);
    const access = requireCookieValue(login, "access_token");
    const refresh = requireCookieValue(login, "refresh_token");
    await request(app).get("/me").set("Cookie", `access_token=${access}`);

    const out = lines.join("");
    expect(out).toContain('"statusCode":200'); // the requests were really logged
    expect(out).not.toContain(access);
    expect(out).not.toContain(refresh);
  });
});

describe("error handler logging", () => {
  function appThatThrows(thrower: () => never) {
    const { lines, log } = captureLogs();
    const app = express();
    app.use(pinoHttp({ logger: log }));
    app.get("/boom", () => {
      thrower();
    });
    app.use(errorHandler);
    return { app, lines };
  }

  it("flags when something that is not an Error was thrown", async () => {
    const { app, lines } = appThatThrows(() => {
      // Intentional: this is exactly the bug the lint rule exists to prevent
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 1;
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
    expect(lines.join("")).toContain('"thrownNonError":true');
  });

  it("logs the real error but keeps its detail out of the response", async () => {
    const { app, lines } = appThatThrows(() => {
      throw new Error("db exploded");
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db exploded");
    const out = lines.join("");
    expect(out).toContain("db exploded");
    expect(out).toContain('"thrownNonError":false');
  });
});
