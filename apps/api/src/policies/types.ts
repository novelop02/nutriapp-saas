import type { Role } from "@nutriapp/shared";

export type Actor = { userId: string; role: Role };

// What a patient record needs to expose for authorization decisions.
// The exact shape is confirmed in week 3 when the patients table exists.
export type PatientOwnership = {
  patientUserId: string | null;
  nutritionistUserId: string;
};
