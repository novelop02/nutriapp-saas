import argon2 from "argon2";
import type { AuthUser, RegisterInput } from "@nutriapp/shared";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { AppError } from "../../errors.js";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function registerNutricionist(input: RegisterInput): Promise<AuthUser> {
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
      throw new AppError(409, "email_taken", "Ese email ya esta registrado");
    }
    throw err;
  }
}
