import { jwtVerify, SignJWT } from "jose";
import z from "zod";
import { roleSchema, type AuthUser } from "@nutriapp/shared";
import { env } from "../config/env.js";

const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const TOKEN_ISSUER = "nutritrack-api";
export const TOKEN_AUDIENCE = "nutritrack-web";

const claimsSchema = z.object({ sub: z.uuid(), role: roleSchema });

export async function signAccessToken(user: Pick<AuthUser, "id" | "role">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + env.ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, key, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    algorithms: ["HS256"], // fija el algoritmo: nunca aceptes el que diga el token
  });
  return claimsSchema.parse(payload); // los claims también se validan con Zod
}
