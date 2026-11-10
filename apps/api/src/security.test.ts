import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { securityHeaders } from "./middleware/security.js";

const app = createApp();
const evilOrigin = "https://evil.example";

const [allowedOrigin] = env.ALLOWED_ORIGINS;
if (!allowedOrigin) throw new Error("ALLOWED_ORIGINS needs at least one origin in .env.test");

const unknownUser = { email: "nobody@example.com", password: "whatever-123" };

afterAll(async () => {
  await pool.end();
});

describe("security headers", () => {
  it("sends the hardening headers and hides the framework", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("sends the headers on error responses too", async () => {
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  function miniApp(hsts: boolean) {
    const mini = express();
    mini.use(securityHeaders({ hsts }));
    mini.get("/x", (_req, res) => {
      res.json({});
    });
    return mini;
  }

  it("sends HSTS only when enabled (production)", async () => {
    const off = await request(miniApp(false)).get("/x");
    const on = await request(miniApp(true)).get("/x");

    expect(off.headers["strict-transport-security"]).toBeUndefined();
    expect(on.headers["strict-transport-security"]).toContain("max-age=");
  });
});

describe("CORS", () => {
  it("answers the preflight of an allowed origin, with credentials and never a wildcard", async () => {
    const res = await request(app)
      .options("/auth/login")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-headers"]).toMatch(/content-type/i);
    expect(res.headers["vary"]).toMatch(/origin/i);
  });

  it("gives an origin outside the list no permission", async () => {
    const res = await request(app)
      .options("/auth/login")
      .set("Origin", evilOrigin)
      .set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("lets an allowed origin read the response of a real request", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Origin", allowedOrigin)
      .send(unknownUser);

    expect(res.status).toBe(401); // it went through the guard and reached the login
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
  });

  it("sends no CORS headers when there is no Origin", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("origin guard", () => {
  it("rejects a state-changing request from an unknown origin", async () => {
    const res = await request(app).post("/auth/login").set("Origin", evilOrigin).send(unknownUser);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_origin");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects the literal 'null' origin", async () => {
    const res = await request(app).post("/auth/login").set("Origin", "null").send(unknownUser);

    expect(res.status).toBe(403);
  });

  it("lets requests without Origin through (curl, servers, tests)", async () => {
    const res = await request(app).post("/auth/login").send(unknownUser);

    expect(res.status).toBe(401);
  });

  it("does not block safe methods from other origins, but gives them no CORS access", async () => {
    const res = await request(app).get("/health").set("Origin", evilOrigin);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("body limits and content types", () => {
  it("rejects a body over 10 KB on /auth with 413", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: unknownUser.email, password: "x".repeat(20_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });

  it("does not parse text bodies", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(unknownUser));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("does not parse form bodies", async () => {
    const res = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email: unknownUser.email, password: unknownUser.password });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });
});
