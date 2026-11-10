import type { Actor, PatientOwnership } from "./types.js";

export function canViewPatient(actor: Actor, patient: PatientOwnership): boolean {
  switch (actor.role) {
    case "nutritionist":
      return patient.nutritionistUserId === actor.userId;
    case "patient":
      return patient.patientUserId === actor.userId;
    case "admin":
      return false; // no clinical acces by default
    default: {
      // If a new role is added and not handled here, this stops compiling
      const unhandled: never = actor.role;
      return unhandled;
    }
  }
}

// Viewing and managing are different: a patient sees their record but does not edit it
export function canManagePatient(actor: Actor, patient: PatientOwnership): boolean {
  return actor.role === "nutritionist" && patient.nutritionistUserId === actor.userId;
}
