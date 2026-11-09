import { sql } from "drizzle-orm";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import { db, pool } from "../../db/client.js";
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from "../../lib/tokens.js";

const app = createApp();
const credentials = { email: "ana@example.com", password: "safe-password-123" };

async function signTestToken(opts: { sub: string; exp: number; secret?: string }) {
  const key = new TextEncoder().encode(opts.secret ?? env.JWT_ACCESS_SECRET);
  return new SignJWT({ role: "nutritionist" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.sub)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.exp)
    .sign(key);
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

let userId: string;

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
  const res = await request(app).post("/auth/register").send(credentials);
  userId = res.body.user.id;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /me", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("returns the current user after logging in", async () => {
    const agent = request.agent(app); // conserva las cookies entre peticiones
    await agent.post("/auth/login").send(credentials);

    const res = await agent.get("/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, email: "ana@example.com" });
    expect(res.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app).get("/me").set("Cookie", "access_token=not-a-jwt");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const token = await signTestToken({ sub: userId, exp: nowInSeconds() - 60 });
    const res = await request(app).get("/me").set("Cookie", `access_token=${token}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for a token signed with another secret", async () => {
    const token = await signTestToken({
      sub: userId,
      exp: nowInSeconds() + 600,
      secret: "another-secret-that-is-long-enough-123456",
    });
    const res = await request(app).get("/me").set("Cookie", `access_token=${token}`);

    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed token (control case)", async () => {
    const token = await signTestToken({ sub: userId, exp: nowInSeconds() + 600 });
    const res = await request(app).get("/me").set("Cookie", `access_token=${token}`);

    expect(res.status).toBe(200);
  });

  it("returns 401 when the user no longer exists", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send(credentials);
    await db.execute(sql`truncate table users cascade`);

    const res = await agent.get("/me");

    expect(res.status).toBe(401);
  });
});
