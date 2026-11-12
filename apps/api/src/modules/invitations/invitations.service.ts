import argon2 from "argon2";
import { and, eq, isNull } from "drizzle-orm";
import type { AcceptInvitationInput, AuthUser } from "@nutriapp/shared";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { isUniqueViolation } from "../../db/errors.js";
import { invitations, patients, users } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import type { Mailer } from "../../lib/mailer.js";
import { generateSecureToken, hashSecureToken } from "../../lib/secure-token.js";
import { invitationEmail } from "../../mail/templates.js";
import type { Actor } from "../../policies/types.js";
import { getPatientForManagement } from "../patients/patients.service.js";

const INVITATION_TTL_HOURS = 72;

type InvitationRow = typeof invitations.$inferSelect;

export type InvalidReason =
  "not_found" | "used" | "revoked" | "expired" | "patient_already_linked" | "email_in_use";

// Same public answer for every reason; the reason itself only goes to the log
export class InvitationInvalidError extends AppError {
  readonly reason: InvalidReason;

  constructor(reason: InvalidReason) {
    super(400, "invalid_invitation", "This invitation link is invalid or has expired");
    this.reason = reason;
  }
}

export class InvitationMailError extends AppError {
  readonly invitationId: string;
  readonly mailError: unknown;

  constructor(invitationId: string, mailError: unknown) {
    super(502, "mail_delivery_failed", "The invitation email could not be sent, try again");
    this.invitationId = invitationId;
    this.mailError = mailError;
  }
}

function invalidReason(invitation: InvitationRow): InvalidReason | null {
  if (invitation.usedAt) return "used";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt <= new Date()) return "expired";
  return null;
}

function invitationLink(token: string): string {
  const url = new URL("/invitations/accept", env.APP_URL);
  url.hash = `token=${token}`; // the fragment never reaches any server
  return url.toString();
}

export async function createInvitation(actor: Actor, patientId: string, mailer: Mailer) {
  const patient = await getPatientForManagement(actor, patientId);

  if (patient.userId !== null) {
    throw new AppError(409, "patient_already_linked", "This patient already has an account");
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, patient.email))
    .limit(1);
  if (existing) {
    throw new AppError(409, "email_in_use", "That email already has an account");
  }

  const { token, hash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);

  const invitation = await db.transaction(async (tx) => {
    // Re-sending invalidates every previous link for this patient
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.patientId, patient.id),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({ patientId: patient.id, tokenHash: hash, expiresAt })
      .returning();
    if (!row) throw new Error("Insert did not return anything");
    return row;
  });

  try {
    await mailer.send(
      invitationEmail({
        to: patient.email,
        patientFirstName: patient.firstName,
        link: invitationLink(token),
        expiresInHours: INVITATION_TTL_HOURS,
      }),
    );
  } catch (err) {
    // Compensating action: a link nobody received must not stay valid
    await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(eq(invitations.id, invitation.id));
    throw new InvitationMailError(invitation.id, err);
  }

  return invitation;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<AuthUser> {
  const hash = hashSecureToken(input.token);

  // Cheap check first: never spend an argon2 hash on a token that cannot work
  const [candidate] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hash))
    .limit(1);
  if (!candidate) throw new InvitationInvalidError("not_found");
  const early = invalidReason(candidate);
  if (early) throw new InvitationInvalidError(early);

  // Hash outside the transaction: keep the time rows stay locked short
  const passwordHash = await argon2.hash(input.password);

  try {
    return await db.transaction(async (tx) => {
      // Re-check under a lock: a concurrent accept may have used it meanwhile
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hash))
        .for("update");
      if (!invitation) throw new InvitationInvalidError("not_found");
      const reason = invalidReason(invitation);
      if (reason) throw new InvitationInvalidError(reason); // no writes yet: rollback is harmless

      const [patient] = await tx
        .select()
        .from(patients)
        .where(eq(patients.id, invitation.patientId))
        .for("update");
      if (!patient || patient.userId !== null) {
        throw new InvitationInvalidError("patient_already_linked");
      }

      const [user] = await tx
        .insert(users)
        .values({ email: patient.email, passwordHash, role: "patient" })
        .returning({ id: users.id, email: users.email, role: users.role });
      if (!user) throw new Error("Insert did not return anything");

      await tx
        .update(patients)
        .set({ userId: user.id, updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
      await tx
        .update(invitations)
        .set({ usedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      return user;
    });
  } catch (err) {
    // Someone registered that email after the invitation was sent
    if (isUniqueViolation(err)) throw new InvitationInvalidError("email_in_use");
    throw err;
  }
}
