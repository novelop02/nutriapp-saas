import type { PatientDto } from "@nutriapp/shared";
import type { patients } from "../../db/schema.js";

export type PatientRow = typeof patients.$inferSelect;

export function toPatientDto(row: PatientRow): PatientDto {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    birthDate: row.birthDate,
    goal: row.goal,
    allergies: row.allergies,
    notes: row.notes,
    linked: row.userId !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
