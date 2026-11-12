import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "./client.js";
import { invitations, patients, users } from "./schema.js";

async function createUser(email: string, role: "nutritionist" | "patient" = "nutritionist") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash", role })
    .returning();
  if (!user) throw new Error("Insert did not return anything");
  return user;
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

async function expectPgError(action: Promise<unknown>, code: string) {
  try {
    await action;
  } catch (err) {
    expect(pgCode(err)).toBe(code);
    return;
  }
  throw new Error(`Expected Postgres error ${code}, but the query succeeded`);
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

const ana = { firstName: "Ana", lastName: "Lopez", email: "ana@example.com" };

beforeEach(async () => {
  await db.execute(sql`truncate table users cascade`);
});

afterAll(async () => {
  await pool.end();
});

describe("patients", () => {
  it("rejects two records with the same email for one nutritionist", async () => {
    const nutri = await createUser("nutri@example.com");
    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id });

    await expectPgError(
      db.insert(patients).values({ ...ana, nutritionistId: nutri.id }),
      UNIQUE_VIOLATION,
    );
  });

  it("allows the same email under different nutritionists", async () => {
    const a = await createUser("a@example.com");
    const b = await createUser("b@example.com");

    await db.insert(patients).values({ ...ana, nutritionistId: a.id });
    await db.insert(patients).values({ ...ana, nutritionistId: b.id });

    expect(await db.select().from(patients)).toHaveLength(2);
  });

  it("links one account to at most one record", async () => {
    const nutri = await createUser("nutri@example.com");
    const account = await createUser("ana@example.com", "patient");
    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id, userId: account.id });

    await expectPgError(
      db.insert(patients).values({
        ...ana,
        email: "other@example.com",
        nutritionistId: nutri.id,
        userId: account.id,
      }),
      UNIQUE_VIOLATION,
    );
  });

  it("allows many records that are not linked yet", async () => {
    const nutri = await createUser("nutri@example.com");

    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id });
    await db
      .insert(patients)
      .values({ ...ana, email: "bob@example.com", nutritionistId: nutri.id });

    expect(await db.select().from(patients)).toHaveLength(2);
  });

  it("does not let a nutritionist with patients be deleted", async () => {
    const nutri = await createUser("nutri@example.com");
    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id });

    await expectPgError(db.delete(users).where(eq(users.id, nutri.id)), FOREIGN_KEY_VIOLATION);
  });

  it("keeps the record and unlinks it when the patient's account is deleted", async () => {
    const nutri = await createUser("nutri@example.com");
    const account = await createUser("ana@example.com", "patient");
    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id, userId: account.id });

    await db.delete(users).where(eq(users.id, account.id));

    const [record] = await db.select().from(patients);
    expect(record?.userId).toBeNull();
    expect(record?.firstName).toBe("Ana");
  });

  it("stores the birth date as a plain calendar date", async () => {
    const nutri = await createUser("nutri@example.com");
    await db.insert(patients).values({ ...ana, nutritionistId: nutri.id, birthDate: "1990-01-31" });

    const [record] = await db.select().from(patients);
    expect(record?.birthDate).toBe("1990-01-31");
  });
});

describe("invitations", () => {
  async function patientWithNutritionist() {
    const nutri = await createUser("nutri@example.com");
    const [patient] = await db
      .insert(patients)
      .values({ ...ana, nutritionistId: nutri.id })
      .returning();
    if (!patient) throw new Error("Insert did not return anything");
    return patient;
  }

  const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

  it("are deleted together with their patient", async () => {
    const patient = await patientWithNutritionist();
    await db
      .insert(invitations)
      .values({ patientId: patient.id, tokenHash: "hash-1", expiresAt: inAnHour() });

    await db.delete(patients).where(eq(patients.id, patient.id));

    expect(await db.select().from(invitations)).toHaveLength(0);
  });

  it("reject a repeated token hash", async () => {
    const patient = await patientWithNutritionist();
    await db
      .insert(invitations)
      .values({ patientId: patient.id, tokenHash: "same-hash", expiresAt: inAnHour() });

    await expectPgError(
      db
        .insert(invitations)
        .values({ patientId: patient.id, tokenHash: "same-hash", expiresAt: inAnHour() }),
      UNIQUE_VIOLATION,
    );
  });
});
