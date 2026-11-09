import type { RequestHandler } from "express";
import { AppError } from "../errors.js";
import { ACCESS_COOKIE } from "../lib/cookies.js";
import { verifyAccessToken } from "../lib/tokens.js";

const unauthenticated = () => new AppError(401, "unauthenticated", "Authentication required");

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== "string") return next(unauthenticated());

  try {
    const claims = await verifyAccessToken(token);
    req.auth = { userId: claims.sub, role: claims.role };
    next();
  } catch {
    // ausente, mal formado, expirado o firmado con otra clave: misma respuesta
    next(unauthenticated());
  }
};
