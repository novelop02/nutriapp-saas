import type { CookieOptions } from "express";
import { env } from "../config/env.js";

export const ACCESS_COOKIE = "access_token";

export function accessCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  };
}
