import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthUser } from "@nutriapp/shared";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { refreshTokens, users } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { generateRefreshToken, hashRefreshToken } from "../../lib/refresh-token.js";

export type SessionMeta = { userAgent: string | null; ip: string | null };

// Same error for missing, unknown, expired, revoked or reused tokens: the client learns nothing
export const invalidRefreshError = () =>
  new AppError(401, "invalid_refresh_token", "Invalid or expired session");

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);

export async function createSession(user: AuthUser, meta: SessionMeta): Promise<string> {
  const { token, hash } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    familyId: randomUUID(),
    tokenHash: hash,
    expiresAt: refreshExpiry(),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return token;
}

type RotateResult =
  | { status: "ok"; user: AuthUser; refreshToken: string }
  | { status: "invalid" }
  | { status: "reuse"; familyId: string };

export async function rotateSession(
  rawToken: string,
  meta: SessionMeta,
): Promise<{ user: AuthUser; refreshToken: string }> {
  const result = await db.transaction(async (tx): Promise<RotateResult> => {
    // FOR UPDATE: a concurrent request with the same token waits here until we commit
    const [current] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(rawToken)))
      .for("update");

    if (!current) return { status: "invalid" };

    if (current.revokedAt) {
      if (current.replacedBy) {
        // A rotated token showed up again: someone has a copy. Kil the whole family
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(refreshTokens.familyId, current.familyId), isNull(refreshTokens.revokedAt)),
          );
        return { status: "reuse", familyId: current.familyId };
      }
      return { status: "invalid" }; // revoked by logout
    }

    if (current.expiresAt <= new Date()) return { status: "invalid" };

    const [user] = await tx
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, current.userId))
      .limit(1);
    if (!user) return { status: "invalid" };

    const { token, hash } = generateRefreshToken();
    const [next] = await tx
      .insert(refreshTokens)
      .values({
        userId: current.userId,
        familyId: current.familyId,
        tokenHash: hash,
        expiresAt: refreshExpiry(),
        userAgent: meta.userAgent,
        ip: meta.ip,
      })
      .returning({ id: refreshTokens.id });
    if (!next) throw new Error("Insert did not return anything");

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(eq(refreshTokens.id, current.id));

    return { status: "ok", user, refreshToken: token };
  });

  // Throw AFTER the transaction: throwing inside it would roll back the family revocation
  if (result.status === "reuse") {
    console.warn("Refresh token reuse detected, family revoked: ", result.familyId);
    throw invalidRefreshError();
  }
  if (result.status === "invalid") throw invalidRefreshError();

  return { user: result.user, refreshToken: result.refreshToken };
}

export async function revokeSessionByToken(rawToken: string): Promise<void> {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(rawToken)))
    .limit(1);
  if (!row) return;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
