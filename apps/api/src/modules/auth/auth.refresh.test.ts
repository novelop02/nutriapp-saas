import { isNull, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";
import { refreshTokens } from "../../db/schema.js";
import { findCookie, requireCookieValue, captureLogs } from "../../../test/helpers.js";

const app = createApp();
const credentials = { email: "ana@example.com", password: "safe-password-123" };

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
  await request(app).post("/auth/register").send(credentials);
  // register now starts a session; begin each test without refresh tokens
  await db.execute(sql`truncate table refresh_tokens`);
});

afterAll(async () => {
  await pool.end();
});

async function login() {
  const res = await request(app).post("/auth/login").send(credentials);
  return { res, token: requireCookieValue(res, "refresh_token") };
}

const refreshWith = (token: string) =>
  request(app).post("/auth/refresh").set("Cookie", `refresh_token=${token}`);

const activeTokens = () => db.select().from(refreshTokens).where(isNull(refreshTokens.revokedAt));

describe("refresh token on login", () => {
  it("sets a strict cookie scoped to /auth and stores only a hash", async () => {
    const { res, token } = await login();

    const cookie = findCookie(res, "refresh_token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/auth");

    const rows = await db.select().from(refreshTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toHaveLength(64);
  });

  it("never returns tokens in the response body", async () => {
    const { res } = await login();

    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the token: the new one works and the old one is marked as replaced", async () => {
    const { token: first } = await login();

    const res = await refreshWith(first);
    expect(res.status).toBe(200);
    const second = requireCookieValue(res, "refresh_token");
    expect(second).not.toBe(first);

    const rows = await db.select().from(refreshTokens);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
    expect(rows.find((r) => r.revokedAt !== null)?.replacedBy).toBeTruthy();

    expect((await refreshWith(second)).status).toBe(200);
  });

  it("returns a fresh access token that works on /me", async () => {
    const { token } = await login();

    const res = await refreshWith(token);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "ana@example.com" });

    const me = await request(app)
      .get("/me")
      .set("Cookie", `access_token=${requireCookieValue(res, "access_token")}`);
    expect(me.status).toBe(200);
  });

  it("reusing a rotated token revokes the whole family", async () => {
    const { token: first } = await login();
    const second = requireCookieValue(await refreshWith(first), "refresh_token");

    const reuse = await refreshWith(first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("invalid_refresh_token");

    expect((await refreshWith(second)).status).toBe(401); // the family is dead
    expect(await activeTokens()).toHaveLength(0);
  });

  it("two simultaneous refreshes with the same token: one wins and the family is revoked", async () => {
    const { token } = await login();

    const [a, b] = await Promise.all([refreshWith(token), refreshWith(token)]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect(await activeTokens()).toHaveLength(0);
  });

  it("returns 401 without a cookie", async () => {
    const res = await request(app).post("/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_refresh_token");
  });

  it("returns 401 for a garbage token and clears the cookies", async () => {
    const res = await refreshWith("not-a-real-token");

    expect(res.status).toBe(401);
    expect(findCookie(res, "refresh_token")).toMatch(/^refresh_token=;/);
    expect(findCookie(res, "access_token")).toMatch(/^access_token=;/);
  });

  it("rejects an expired token", async () => {
    const { token } = await login();
    await db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await refreshWith(token)).status).toBe(401);
  });
});

describe("refresh token reuse", () => {
  it("logs the reuse with the request id and no secrets", async () => {
    const { lines, log } = captureLogs();
    const logged = createApp(log);
    const loginRes = await request(logged).post("/auth/login").send(credentials);
    const first = requireCookieValue(loginRes, "refresh_token");
    await request(logged).post("/auth/refresh").set("Cookie", `refresh_token=${first}`);

    const reuse = await request(logged)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${first}`);

    expect(reuse.status).toBe(401);
    const reuseLine = lines.find((line) => line.includes('"event":"refresh_token_reuse"'));
    expect(reuseLine).toBeDefined();
    expect(reuseLine).toContain(reuse.get("X-Request-Id"));
    expect(lines.join("")).not.toContain(first);
  });

  it("answers a reuse exactly like any invalid token", async () => {
    const { token: first } = await login();
    await refreshWith(first);

    const reuse = await refreshWith(first);
    const garbage = await refreshWith("not-a-real-token");

    expect(reuse.status).toBe(garbage.status);
    expect(reuse.body).toEqual(garbage.body);
  });
});
