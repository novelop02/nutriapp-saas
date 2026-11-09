import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";

const app = createApp();
const credentials = { email: "ana@example.com", password: "safe-password-123" };

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
  await request(app).post("/auth/register").send(credentials);
});

afterAll(async () => {
  await pool.end();
});

describe("POST /auth/login", () => {
  it("logs in and sets an httpOnly access cookie", async () => {
    const res = await request(app).post("/auth/login").send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "ana@example.com", role: "nutritionist" });
    expect(JSON.stringify(res.body)).not.toMatch(/token|password|hash/i);

    const cookie = (res.get("Set-Cookie") ?? []).find((c) => c.startsWith("access_token="));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("accepts the email with different casing", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ ...credentials, email: "ANA@Example.com" });

    expect(res.status).toBe(200);
  });

  it("answers wrong password and unknown email in exactly the same way", async () => {
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ ...credentials, password: "wrong-password-999" });
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password-999" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe("invalid_credentials");
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.get("Set-Cookie")).toBeUndefined();
    expect(unknownEmail.get("Set-Cookie")).toBeUndefined();
  });

  it("rejects extra fields", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ ...credentials, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("rejects a missing password", async () => {
    const res = await request(app).post("/auth/login").send({ email: credentials.email });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("password");
  });

  it("rejects an invalid email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ ...credentials, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("email");
  });
});
