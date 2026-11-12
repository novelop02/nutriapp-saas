import { eq, isNull, sql } from "drizzle-orm";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fakeMailer } from "../../../test/fake-mailer.js";
import { captureLogs, findCookie } from "../../../test/helpers.js";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import { db, pool } from "../../db/client.js";
import { invitations, users } from "../../db/schema.js";
import type { Mailer } from "../../lib/mailer.js";

const silent = pino({ level: "silent" });
const { mailer, sent } = fakeMailer();
const app = createApp(silent, { mailer });

const password = "safe-password-123";
const patientPassword = "patient-password-456";

type Agent = ReturnType<typeof request.agent>;

async function nutritionist(email = "nutri@example.com", target = app): Promise<Agent> {
  const agent = request.agent(target);
  const res = await agent.post("/auth/register").send({ email, password });
  if (res.status !== 201) throw new Error(`register failed with ${res.status}`);
  return agent;
}

async function patientOf(agent: Agent, email = "ana@example.com"): Promise<string> {
  const res = await agent.post("/patients").send({ firstName: "Ana", lastName: "Lopez", email });
  return String(res.body.patient.id);
}

function tokenFrom(index = sent.length - 1): string {
  const mail = sent[index];
  const match = mail ? /#token=([A-Za-z0-9_-]+)/.exec(mail.text) : null;
  if (!match?.[1]) throw new Error("No invitation link in the email");
  return match[1];
}

const accept = (token: string, pwd = patientPassword) =>
  request(app).post("/invitations/accept").send({ token, password: pwd });

beforeEach(async () => {
  sent.length = 0;
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
});

describe("POST /patients/:id/invitations", () => {
  it("emails a one-time link and never returns the token", async () => {
    const nutri = await nutritionist();
    const id = await patientOf(nutri);

    const res = await nutri.post(`/patients/${id}/invitations`);

    expect(res.status).toBe(201);
    expect(res.body.invitation).toHaveProperty("expiresAt");
    const token = tokenFrom();
    expect(JSON.stringify(res.body)).not.toContain(token);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana@example.com");
    expect(sent[0]?.text).toContain(`${env.APP_URL}/invitations/accept#token=`);
    expect(sent[0]?.text).not.toContain("?token=");

    const [row] = await db.select().from(invitations);
    expect(row?.tokenHash).not.toBe(token);
  });

  it("only lets the owner invite", async () => {
    const owner = await nutritionist();
    const other = await nutritionist("other@example.com");
    const id = await patientOf(owner);

    expect((await other.post(`/patients/${id}/invitations`)).status).toBe(404);
    expect((await request(app).post(`/patients/${id}/invitations`)).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("re-sending revokes the previous link", async () => {
    const nutri = await nutritionist();
    const id = await patientOf(nutri);
    await nutri.post(`/patients/${id}/invitations`);
    await nutri.post(`/patients/${id}/invitations`);

    expect((await accept(tokenFrom(0))).status).toBe(400);
    expect((await accept(tokenFrom(1))).status).toBe(201);
  });

  it("refuses to invite a patient who already has an account", async () => {
    const nutri = await nutritionist();
    const id = await patientOf(nutri);
    await nutri.post(`/patients/${id}/invitations`);
    await accept(tokenFrom());

    const res = await nutri.post(`/patients/${id}/invitations`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("patient_already_linked");
  });

  it("refuses when the email already belongs to an account", async () => {
    await nutritionist("ana@example.com");
    const nutri = await nutritionist();
    const id = await patientOf(nutri, "ana@example.com");

    const res = await nutri.post(`/patients/${id}/invitations`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_in_use");
  });

  it("revokes the invitation when the email cannot be sent", async () => {
    const broken: Mailer = { send: () => Promise.reject(new Error("smtp down")) };
    const failing = createApp(silent, { mailer: broken });
    const nutri = await nutritionist("nutri@example.com", failing);
    const id = await patientOf(nutri);

    const res = await nutri.post(`/patients/${id}/invitations`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("mail_delivery_failed");
    expect(await db.select().from(invitations).where(isNull(invitations.revokedAt))).toHaveLength(
      0,
    );
  });
});

describe("POST /invitations/accept", () => {
  async function invited() {
    const nutri = await nutritionist();
    const id = await patientOf(nutri);
    await nutri.post(`/patients/${id}/invitations`);
    return { id, token: tokenFrom() };
  }

  it("creates the patient account, links the record and starts a session", async () => {
    const { id, token } = await invited();
    const patient = request.agent(app);

    const res = await patient
      .post("/invitations/accept")
      .send({ token, password: patientPassword });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ana@example.com", role: "patient" });
    expect(findCookie(res, "access_token")).toBeDefined();

    expect((await patient.get("/me")).body.user.role).toBe("patient");
    const own = await patient.get(`/patients/${id}`);
    expect(own.status).toBe(200);
    expect(own.body.patient.linked).toBe(true);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: patientPassword });
    expect(login.status).toBe(200);
  });

  it("works only once", async () => {
    const { token } = await invited();
    await accept(token);

    const again = await accept(token);

    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_invitation");
  });

  it("rejects an expired link", async () => {
    const { token } = await invited();
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await accept(token)).status).toBe(400);
  });

  it("answers a used link and an invented one in exactly the same way", async () => {
    const { token } = await invited();
    await accept(token);

    const used = await accept(token);
    const invented = await accept("x".repeat(43));

    expect(used.status).toBe(invented.status);
    expect(used.body).toEqual(invented.body);
  });

  it("rejects a weak password without consuming the link", async () => {
    const { token } = await invited();

    expect((await accept(token, "short")).status).toBe(400);
    expect((await accept(token)).status).toBe(201);
  });

  it("with two simultaneous accepts, exactly one account is created", async () => {
    const { token } = await invited();

    const [a, b] = await Promise.all([accept(token), accept(token)]);

    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await db.select().from(users).where(eq(users.role, "patient"))).toHaveLength(1);
  });

  it("logs why a link failed, without the token", async () => {
    const { lines, log } = captureLogs();
    const logged = createApp(log, { mailer });
    const fake = "y".repeat(43);

    await request(logged)
      .post("/invitations/accept")
      .send({ token: fake, password: patientPassword });

    const line = lines.find((l) => l.includes('"event":"invitation_invalid"'));
    expect(line).toContain('"reason":"not_found"');
    expect(lines.join("")).not.toContain(fake);
  });
});
