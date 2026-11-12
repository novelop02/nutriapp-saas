import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db, pool } from "../../db/client.js";
import { patients, users } from "../../db/schema.js";
import { signAccessToken } from "../../lib/tokens.js";

const app = createApp();
const password = "safe-password-123";

async function nutritionist(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/register").send({ email, password });
  if (res.status !== 201) throw new Error(`register failed with ${res.status}`);
  return { agent, id: String(res.body.user.id) };
}

async function patientAccount(email: string) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash", role: "patient" })
    .returning();
  if (!user) throw new Error("Insert did not return anything");
  const token = await signAccessToken({ id: user.id, role: "patient" });
  return { id: user.id, cookie: `access_token=${token}` };
}

async function adminCookie() {
  return `access_token=${await signAccessToken({ id: randomUUID(), role: "admin" })}`;
}

const ana = {
  firstName: "Ana",
  lastName: "Lopez",
  email: "Ana@Example.com",
  notes: "Private clinical note",
};

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
});

describe("POST /patients", () => {
  it("creates a patient owned by the logged-in nutritionist", async () => {
    const a = await nutritionist("a@example.com");

    const res = await a.agent.post("/patients").send(ana);

    expect(res.status).toBe(201);
    expect(res.body.patient).toMatchObject({
      firstName: "Ana",
      email: "ana@example.com",
      linked: false,
    });
    expect(res.body.patient).not.toHaveProperty("nutritionistId");
    expect(res.body.patient).not.toHaveProperty("userId");
  });

  it("rejects choosing the owner in the body (mass assignment)", async () => {
    const a = await nutritionist("a@example.com");
    const b = await nutritionist("b@example.com");

    const res = await a.agent.post("/patients").send({ ...ana, nutritionistId: b.id });

    expect(res.status).toBe(400);
    expect(await db.select().from(patients)).toHaveLength(0);
  });

  it("answers 409 for a repeated email, ignoring case", async () => {
    const a = await nutritionist("a@example.com");
    await a.agent.post("/patients").send(ana);

    const res = await a.agent.post("/patients").send({ ...ana, email: "ana@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("patient_email_taken");
  });

  it("lets two nutritionists have a patient with the same email", async () => {
    const a = await nutritionist("a@example.com");
    const b = await nutritionist("b@example.com");
    await a.agent.post("/patients").send(ana);

    expect((await b.agent.post("/patients").send(ana)).status).toBe(201);
  });

  it("rejects a birth date in the future", async () => {
    const a = await nutritionist("a@example.com");

    const res = await a.agent.post("/patients").send({ ...ana, birthDate: "2999-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty("birthDate");
  });
});

describe("GET /patients", () => {
  it("lists only the nutritionist's own patients, sorted by last name", async () => {
    const a = await nutritionist("a@example.com");
    const b = await nutritionist("b@example.com");
    await a.agent.post("/patients").send({ ...ana, lastName: "Ruiz" });
    await a.agent.post("/patients").send({ ...ana, email: "bob@example.com", lastName: "Alvarez" });
    await b.agent.post("/patients").send({ ...ana, email: "carla@example.com" });

    const res = await a.agent.get("/patients");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((p: { lastName: string }) => p.lastName)).toEqual([
      "Alvarez",
      "Ruiz",
    ]);
  });

  it("paginates and reports whether there is more", async () => {
    const a = await nutritionist("a@example.com");
    await a.agent.post("/patients").send(ana);
    await a.agent.post("/patients").send({ ...ana, email: "bob@example.com" });

    const first = await a.agent.get("/patients?limit=1");
    const second = await a.agent.get("/patients?limit=1&offset=1");

    expect(first.body.items).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.hasMore).toBe(false);
  });

  it("rejects a page size over 100", async () => {
    const a = await nutritionist("a@example.com");

    expect((await a.agent.get("/patients?limit=500")).status).toBe(400);
  });
});

describe("GET /patients/:id", () => {
  it("returns the nutritionist's own patient, notes included", async () => {
    const a = await nutritionist("a@example.com");
    const created = await a.agent.post("/patients").send(ana);

    const res = await a.agent.get(`/patients/${created.body.patient.id}`);

    expect(res.status).toBe(200);
    expect(res.body.patient.notes).toBe("Private clinical note");
  });

  it("answers someone else's patient exactly like one that does not exist", async () => {
    const a = await nutritionist("a@example.com");
    const b = await nutritionist("b@example.com");
    const created = await a.agent.post("/patients").send(ana);

    const foreign = await b.agent.get(`/patients/${created.body.patient.id}`);
    const missing = await b.agent.get(`/patients/${randomUUID()}`);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("answers 404, not 500, for an id that is not a UUID", async () => {
    const a = await nutritionist("a@example.com");

    expect((await a.agent.get("/patients/not-a-uuid")).status).toBe(404);
  });
});

describe("PATCH /patients/:id", () => {
  it("updates the patient and clears optional fields with null", async () => {
    const a = await nutritionist("a@example.com");
    const { id } = (await a.agent.post("/patients").send(ana)).body.patient;

    const set = await a.agent.patch(`/patients/${id}`).send({ goal: "Lose 5 kg" });
    const cleared = await a.agent.patch(`/patients/${id}`).send({ goal: null });

    expect(set.body.patient.goal).toBe("Lose 5 kg");
    expect(cleared.body.patient.goal).toBeNull();
  });

  it("answers 404 for someone else's patient and leaves it untouched", async () => {
    const a = await nutritionist("a@example.com");
    const b = await nutritionist("b@example.com");
    const { id } = (await a.agent.post("/patients").send(ana)).body.patient;

    const res = await b.agent.patch(`/patients/${id}`).send({ firstName: "Hacked" });

    expect(res.status).toBe(404);
    const [row] = await db.select().from(patients).where(eq(patients.id, id));
    expect(row?.firstName).toBe("Ana");
  });

  it("rejects changing the email and an empty body", async () => {
    const a = await nutritionist("a@example.com");
    const { id } = (await a.agent.post("/patients").send(ana)).body.patient;

    expect((await a.agent.patch(`/patients/${id}`).send({ email: "x@example.com" })).status).toBe(
      400,
    );
    expect((await a.agent.patch(`/patients/${id}`).send({})).status).toBe(400);
  });
});

describe("patients, admins and anonymous users", () => {
  async function linkedPatient() {
    const a = await nutritionist("a@example.com");
    const { id } = (await a.agent.post("/patients").send(ana)).body.patient;
    const account = await patientAccount("ana@example.com");
    await db.update(patients).set({ userId: account.id }).where(eq(patients.id, id));
    return { a, id, account };
  }

  it("a linked patient sees their own record without the private notes", async () => {
    const { id, account } = await linkedPatient();

    const res = await request(app).get(`/patients/${id}`).set("Cookie", account.cookie);

    expect(res.status).toBe(200);
    expect(res.body.patient.linked).toBe(true);
    expect(res.body.patient).not.toHaveProperty("notes");
  });

  it("a patient cannot see another record", async () => {
    const { a } = await linkedPatient();
    const other = (await a.agent.post("/patients").send({ ...ana, email: "bob@example.com" })).body
      .patient;
    const stranger = await patientAccount("stranger@example.com");

    const res = await request(app).get(`/patients/${other.id}`).set("Cookie", stranger.cookie);

    expect(res.status).toBe(404);
  });

  it("a patient cannot list or edit", async () => {
    const { id, account } = await linkedPatient();

    expect((await request(app).get("/patients").set("Cookie", account.cookie)).status).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/patients/${id}`)
          .set("Cookie", account.cookie)
          .send({ goal: "x" })
      ).status,
    ).toBe(403);
  });

  it("an admin has no clinical access", async () => {
    const { id } = await linkedPatient();
    const cookie = await adminCookie();

    expect((await request(app).get("/patients").set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).get(`/patients/${id}`).set("Cookie", cookie)).status).toBe(403);
  });

  it("nothing is reachable without a session", async () => {
    expect((await request(app).get("/patients")).status).toBe(401);
    expect((await request(app).post("/patients").send(ana)).status).toBe(401);
  });
});
