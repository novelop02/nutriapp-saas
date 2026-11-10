import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import cookieParser from "cookie-parser";
import express from "express";
import { pino, type Logger } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Role } from "@nutriapp/shared";
import { signAccessToken } from "../lib/tokens.js";
import { errorHandler } from "./error-handler.js";
import { requireAuth } from "./require-auth.js";
import { requireRole } from "./require-role.js";
import { loggerOptions } from "../lib/logger.js";

const ok: express.RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

function buildApp(log: Logger = pino({ level: "silent" })) {
  const app = express();
  app.use(pinoHttp({ logger: log }));
  app.use(cookieParser());

  app.get("/any", requireAuth, ok);
  app.get("/nutritionist-only", requireAuth, requireRole("nutritionist"), ok);
  app.get("/patient-only", requireAuth, requireRole("patient"), ok);
  app.get("/admin-only", requireAuth, requireRole("admin"), ok);
  app.get("/staff", requireAuth, requireRole("nutritionist", "admin"), ok);
  app.get("/forgot-auth", requireRole("admin"), ok); // misconfigured on purpose

  app.use(errorHandler);
  return app;
}

// Expected status for each route and role. When a route is added to the API,
// add it here: this table is the contract of who can enter where.
const matrix: Record<string, Record<Role, number>> = {
  "/any": { nutritionist: 200, patient: 200, admin: 200 },
  "/nutritionist-only": { nutritionist: 200, patient: 403, admin: 403 },
  "/patient-only": { nutritionist: 403, patient: 200, admin: 403 },
  "/admin-only": { nutritionist: 403, patient: 403, admin: 200 },
  "/staff": { nutritionist: 200, patient: 403, admin: 200 },
};

const cases = Object.entries(matrix).flatMap(([path, byRole]) =>
  (Object.entries(byRole) as [Role, number][]).map(([role, status]) => ({ path, role, status })),
);

async function cookieFor(role: Role) {
  const token = await signAccessToken({ id: randomUUID(), role });
  return `access_token=${token}`;
}

const app = buildApp();

describe("role matrix", () => {
  it.each(cases)("$path as $role -> $status", async ({ path, role, status }) => {
    const res = await request(app)
      .get(path)
      .set("Cookie", await cookieFor(role));

    expect(res.status).toBe(status);
    if (status === 403) expect(res.body.error.code).toBe("forbidden");
  });

  it.each(Object.keys(matrix))("%s without a session -> 401", async (path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});

describe("requireRole behaviour", () => {
  it("fails closed when requireAuth was forgotten", async () => {
    const res = await request(app)
      .get("/forgot-auth")
      .set("Cookie", await cookieFor("admin"));

    expect(res.status).toBe(401);
  });

  it("refuses to be created without roles", () => {
    expect(() => requireRole()).toThrow();
  });

  it("does not reveal which roles would be allowed", async () => {
    const res = await request(app)
      .get("/admin-only")
      .set("Cookie", await cookieFor("patient"));

    expect(JSON.stringify(res.body)).not.toMatch(/admin|nutritionist|patient/);
  });

  it("logs the denial with ids and roles but no cookies", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const logged = buildApp(pino({ ...loggerOptions, level: "info" }, sink));
    const cookie = await cookieFor("patient");

    await request(logged).get("/admin-only").set("Cookie", cookie);

    const out = lines.join("");
    expect(out).toContain("authorization_denied");
    expect(out).toContain('"role":"patient"');
    expect(out).not.toContain(cookie.split("=")[1]);
  });
});
