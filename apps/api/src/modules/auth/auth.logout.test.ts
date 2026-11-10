import { isNull, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";
import { refreshTokens } from "../../db/schema.js";
import { findCookie, requireCookieValue } from "../../../test/helpers.js";

const app = createApp();
const credentials = { email: "ana@example.com", password: "safe-password-123" };

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
  await request(app).post("/auth/register").send(credentials);
  await db.execute(sql`truncate table refresh_tokens`);
});

afterAll(async () => {
  await pool.end();
});

async function login() {
  const res = await request(app).post("/auth/login").send(credentials);
  return {
    access: requireCookieValue(res, "access_token"),
    token: requireCookieValue(res, "refresh_token"),
  };
}

const refreshWith = (token: string) =>
  request(app).post("/auth/refresh").set("Cookie", `refresh_token=${token}`);

const activeTokens = () => db.select().from(refreshTokens).where(isNull(refreshTokens.revokedAt));

describe("POST /auth/logout", () => {
  it("revokes the session and clears both cookies", async () => {
    const { token } = await login();

    const res = await request(app).post("/auth/logout").set("Cookie", `refresh_token=${token}`);

    expect(res.status).toBe(204);
    expect(findCookie(res, "refresh_token")).toMatch(/^refresh_token=;/);
    expect(findCookie(res, "access_token")).toMatch(/^access_token=;/);
    expect((await refreshWith(token)).status).toBe(401);
    expect(await activeTokens()).toHaveLength(0);
  });

  it("is idempotent when there is no cookie", async () => {
    const res = await request(app).post("/auth/logout");

    expect(res.status).toBe(204);
  });

  it("only ends the current session", async () => {
    const first = await login();
    const second = await login();

    await request(app).post("/auth/logout").set("Cookie", `refresh_token=${first.token}`);

    expect((await refreshWith(first.token)).status).toBe(401);
    expect((await refreshWith(second.token)).status).toBe(200);
  });
});

describe("POST /auth/logout-all", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/auth/logout-all");

    expect(res.status).toBe(401);
  });

  it("ends every session of the user", async () => {
    const first = await login();
    const second = await login();

    const res = await request(app)
      .post("/auth/logout-all")
      .set("Cookie", `access_token=${first.access}`);

    expect(res.status).toBe(204);
    expect((await refreshWith(first.token)).status).toBe(401);
    expect((await refreshWith(second.token)).status).toBe(401);
  });

  it("does not affect other users", async () => {
    const other = await request(app)
      .post("/auth/register")
      .send({ email: "bob@example.com", password: "another-safe-pass-1" });
    const otherToken = requireCookieValue(other, "refresh_token");

    const { access } = await login();
    await request(app).post("/auth/logout-all").set("Cookie", `access_token=${access}`);

    expect((await refreshWith(otherToken)).status).toBe(200);
  });
});
