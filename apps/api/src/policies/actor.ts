import type { Request } from "express";
import { AppError } from "../errors.js";
import type { Actor } from "./types.js";

export function actorFrom(req: Request): Actor {
  if (!req.auth) throw new AppError(401, "unauthenticated", "Authentication required");
  return { userId: req.auth.userId, role: req.auth.role };
}
