import type { RequestHandler } from "express";
import type { Role } from "@nutriapp/shared";
import { AppError } from "../errors.js";
import { SecurityEvent } from "../lib/security-events.js";

export function requireRole(...allowed: Role[]): RequestHandler {
  // Misconfiguration: fail at startup, not on the first request
  if (allowed.length === 0) throw new Error("requireRole needs at least one role");

  return (req, _res, next) => {
    // Fail closed: if requireAuth did not run before this, there is no identity
    if (!req.auth) {
      return next(new AppError(401, "unauthenticated", "Authentication required"));
    }

    if (!allowed.includes(req.auth.role)) {
      // A security signal worth keeping: who tried what. No emails, only ids.
      req.log.warn({
        event: SecurityEvent.AuthorizationDenied,
        userId: req.auth.userId,
        role: req.auth.role,
        required: allowed,
        path: req.path,
      });
      return next(new AppError(403, "forbidden", "You do not have access to this resource"));
    }
    next();
  };
}
