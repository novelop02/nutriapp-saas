import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import { assertCanManage, assertCanView } from "./access.js";
import { canManagePatient, canViewPatient } from "./patient.policy.js";
import type { Actor, PatientOwnership } from "./types.js";

const owner: Actor = { userId: "nutri-a", role: "nutritionist" };
const otherNutritionist: Actor = { userId: "nutri-b", role: "nutritionist" };
const thePatient: Actor = { userId: "pat-1", role: "patient" };
const otherPatient: Actor = { userId: "pat-2", role: "patient" };
const admin: Actor = { userId: "admin-1", role: "admin" };

const record: PatientOwnership = { patientUserId: "pat-1", nutritionistUserId: "nutri-a" };

function thrown(fn: () => void): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Expected the function to throw");
}

describe("canViewPatient", () => {
  it.each([
    ["the owner nutritionist", owner, true],
    ["another nutritionist", otherNutritionist, false],
    ["the patient themselves", thePatient, true],
    ["another patient", otherPatient, false],
    ["an admin (no clinical access by default)", admin, false],
  ])("%s -> %s", (_name, actor, expected) => {
    expect(canViewPatient(actor, record)).toBe(expected);
  });
});

describe("canManagePatient", () => {
  it.each([
    ["the owner nutritionist", owner, true],
    ["another nutritionist", otherNutritionist, false],
    ["the patient themselves", thePatient, false],
    ["an admin", admin, false],
  ])("%s -> %s", (_name, actor, expected) => {
    expect(canManagePatient(actor, record)).toBe(expected);
  });
});

describe("assertCanView / assertCanManage", () => {
  it("does nothing when allowed", () => {
    expect(() => assertCanView(true)).not.toThrow();
    expect(() => assertCanManage(true, true)).not.toThrow();
  });

  it("answers 404 when the actor cannot see the resource", () => {
    const err = thrown(() => assertCanView(false));
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
  });

  it("answers 404, not 403, to someone who cannot even see the resource", () => {
    const err = thrown(() => assertCanManage(false, false));
    expect(err.status).toBe(404);
  });

  it("answers 403 to someone who can see it but not manage it", () => {
    const err = thrown(() => assertCanManage(true, false));
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });
});

describe("records not linked to an account yet", () => {
  const unlinked: PatientOwnership = { patientUserId: null, nutritionistUserId: "nutri-a" };

  it("are visible only to their nutritionist", () => {
    expect(canViewPatient(owner, unlinked)).toBe(true);
    expect(canViewPatient(otherNutritionist, unlinked)).toBe(false);
    expect(canViewPatient(thePatient, unlinked)).toBe(false);
    expect(canViewPatient(admin, unlinked)).toBe(false);
  });
});
