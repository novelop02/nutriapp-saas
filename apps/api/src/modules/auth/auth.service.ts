import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { AuthUser, LoginInput, RegisterInput } from "@nutriapp/shared";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { AppError } from "../../errors.js";

const DUMMY_HASH = await argon2.hash("not-a-real-password");

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function registerNutritionist(input: RegisterInput): Promise<AuthUser> {
  const passwordHash = await argon2.hash(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({ email: input.email, passwordHash, role: "nutritionist" })
      .returning({ id: users.id, email: users.email, role: users.role });

    if (!user) throw new Error("Insert did not return anything");
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "email_taken", "That email is already registered");
    }
    throw err;
  }
}

export async function authenticate(input: LoginInput): Promise<AuthUser> {
  const [row] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  const valid = await argon2.verify(row?.passwordHash ?? DUMMY_HASH, input.password);

  if (!row || !valid) {
    throw new AppError(401, "invalid_credentials", "Invalid email or password");
  }
  return { id: row?.id, email: row?.email, role: row.role };
}

export async function getAuthUserById(id: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}
