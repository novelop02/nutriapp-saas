import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

// The refresh cookie is only sent to /auth/*, never to the rest of the API
const REFRESH_PATH = "/auth";

const isProd = () => env.NODE_ENV === "production";

const accessBase = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd(),
  sameSite: "lax",
  path: "/",
});

const refreshBase = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd(),
  sameSite: "strict",
  path: REFRESH_PATH,
});

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...accessBase(),
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...refreshBase(),
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

// To delete a cookie you must repeat the same path it was set with
export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, accessBase());
  res.clearCookie(REFRESH_COOKIE, refreshBase());
}
