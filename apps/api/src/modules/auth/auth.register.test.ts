import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { findCookie } from "../../../test/helpers.js";

const app = createApp();
const validBody = { email: "ana@example.com", password: "safe-password-123" };

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
});

async function countUsers() {
  return (await db.select().from(users)).length;
}

describe("POST /auth/register", () => {
  it("starts a session: sets the access and refresh cookies", async () => {
    const res = await request(app).post("/auth/register").send(validBody);

    expect(res.status).toBe(201);
    expect(findCookie(res, "access_token")).toContain("HttpOnly");
    expect(findCookie(res, "refresh_token")).toContain("HttpOnly");
  });

  it("creates a nutritionist and returns 201 without sensitive data", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "Ana@Example.COM", password: validBody.password });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ana@example.com", role: "nutritionist" });
    expect(res.body.user.id).toBeTypeOf("string");
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("stores an argon2id hash, not the password", async () => {
    await request(app).post("/auth/register").send(validBody);

    const [row] = await db.select().from(users);
    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row?.passwordHash).not.toContain(validBody.password);
  });

  it("returns 409 when the email already exists, even with different casing", async () => {
    await request(app).post("/auth/register").send(validBody);
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validBody, email: "ANA@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
    expect(await countUsers()).toBe(1);
  });

  it("with two simultaneous registrations of the same email, only one wins", async () => {
    const [a, b] = await Promise.all([
      request(app).post("/auth/register").send(validBody),
      request(app).post("/auth/register").send(validBody),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await countUsers()).toBe(1);
  });

  it("rejects extra fields such as role (mass assignment)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validBody, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(await countUsers()).toBe(0);
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validBody, password: "short1" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("password");
  });

  it("rejects a password without numbers", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validBody, password: "only-letters-in-here" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("password");
  });

  it("rejects an invalid email", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validBody, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("email");
  });

  it("returns 400 when the JSON is malformed", async () => {
    const res = await request(app)
      .post("/auth/register")
      .set("Content-Type", "application/json")
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("general routes", () => {
  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("an unknown route returns 404 as JSON", async () => {
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
