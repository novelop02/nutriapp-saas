import { and, asc, eq } from "drizzle-orm";
import type { CreatePatientInput, ListPatientsQuery, UpdatePatientInput } from "@nutriapp/shared";
import { db } from "../../db/client.js";
import { isUniqueViolation } from "../../db/errors.js";
import { patients } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { assertCanManage, assertCanView } from "../../policies/access.js";
import { canManagePatient, canViewPatient } from "../../policies/patient.policy.js";
import type { Actor, PatientOwnership } from "../../policies/types.js";
import type { PatientRow } from "./patients.dto.js";

const ownershipOf = (row: PatientRow): PatientOwnership => ({
  patientUserId: row.userId,
  nutritionistUserId: row.nutritionistId,
});

export async function createPatient(actor: Actor, input: CreatePatientInput): Promise<PatientRow> {
  try {
    const [row] = await db
      .insert(patients)
      .values({ ...input, nutritionistId: actor.userId }) // owner always comes from the session
      .returning();
    if (!row) throw new Error("Insert did not return anything");
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "patient_email_taken", "You already have a patient with that email");
    }
    throw err;
  }
}

export async function listPatients(actor: Actor, query: ListPatientsQuery) {
  // For lists, the WHERE clause IS the authorization
  const rows = await db
    .select()
    .from(patients)
    .where(eq(patients.nutritionistId, actor.userId))
    .orderBy(asc(patients.lastName), asc(patients.firstName), asc(patients.id))
    .limit(query.limit + 1) // one extra row tells us whether there is a next page
    .offset(query.offset);

  return { items: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
}

async function findPatient(id: string): Promise<PatientRow | undefined> {
  const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return row;
}

export async function getPatient(actor: Actor, id: string): Promise<PatientRow> {
  const row = await findPatient(id);
  // A missing record and someone else's record get exactly the same 404
  assertCanView(row !== undefined);
  assertCanView(canViewPatient(actor, ownershipOf(row)));
  return row;
}

export async function getPatientForManagement(actor: Actor, id: string): Promise<PatientRow> {
  const row = await findPatient(id);
  assertCanView(row !== undefined);
  const ownership = ownershipOf(row);
  assertCanManage(canViewPatient(actor, ownership), canManagePatient(actor, ownership));
  return row;
}

export async function updatePatient(
  actor: Actor,
  id: string,
  input: UpdatePatientInput,
): Promise<PatientRow> {
  await getPatientForManagement(actor, id);

  const [updated] = await db
    .update(patients)
    .set({ ...input, updatedAt: new Date() })
    // Defense in depth: even if the checks above had a bug, the update stays scoped
    .where(and(eq(patients.id, id), eq(patients.nutritionistId, actor.userId)))
    .returning();
  if (!updated) throw new Error("Update did not return anything");
  return updated;
}
