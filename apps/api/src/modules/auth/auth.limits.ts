import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { rateLimit, type RateLimitStore } from "../../lib/rate-limit.js";

const MINUTE = 60_000;

const ipOf = (req: Request) => req.ip ?? "unknown";

// Only a digest of the email reaches Redis, never the email itself
const digest = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);

export function createAuthLimiters(store: RateLimitStore) {
  return {
    registerByIp: rateLimit({
      store,
      name: "register-ip",
      limit: 10,
      windowMs: 60 * MINUTE,
      key: ipOf,
    }),
    loginByIp: rateLimit({
      store,
      name: "login-ip",
      limit: 30,
      windowMs: 15 * MINUTE,
      key: ipOf,
    }),
    // Runs after validate(): req.body.email is already normalized
    loginByEmail: rateLimit({
      store,
      name: "login-email",
      limit: 10,
      windowMs: 15 * MINUTE,
      key: (req) => {
        const email: unknown = req.body?.email;
        return typeof email === "string" ? `${ipOf(req)}:${digest(email)}` : null;
      },
    }),
    refreshByIp: rateLimit({
      store,
      name: "refresh-ip",
      limit: 60,
      windowMs: 15 * MINUTE,
      key: ipOf,
    }),
  };
}

export type AuthLimiters = ReturnType<typeof createAuthLimiters>;

const passthrough: RequestHandler = (_req, _res, next) => next();

export const noLimiters: AuthLimiters = {
  registerByIp: passthrough,
  loginByIp: passthrough,
  loginByEmail: passthrough,
  refreshByIp: passthrough,
};
