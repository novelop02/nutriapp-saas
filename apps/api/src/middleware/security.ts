import cors from "cors";
import type { RequestHandler } from "express";
import helmet from "helmet";
import { AppError } from "../errors.js";

export function securityHeaders(opts: { hsts: boolean }): RequestHandler {
  const helmetMiddleware = helmet({
    // This API only return JSON: it has no reason to load anything
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS only makes sense over HTTPS. Start with a shorter max-age than the
    // helmet default and raise it once HTTPS is stable.
    strictTransportSecurity: opts.hsts ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });
  return (req, res, next) => {
    // Responses carry health data and session state: nothin should cache them
    res.set("Cache-Control", "no-store");
    helmetMiddleware(req, res, next);
  };
}

export function corsPolicy(allowed: readonly string[]) {
  return cors({
    // No Origin means same-origin or not a browser: no CORS headers needed.
    // An origin outside the list gets no CORS headers, and the browser blocks it.
    origin: (origin, callback) => callback(null, origin !== undefined && allowed.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  });
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Defense in depth against CSRF: browsers always send Origin on these methods.
// It protects browsers only; curl can send any Origin it likes.
export function originGuard(allowed: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (!STATE_CHANGING.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin === undefined) return next();
    if (allowed.includes(origin)) return next();

    req.log.warn({ event: "origin_rejected", origin, path: req.path }, "Origin not allowed");
    next(new AppError(403, "forbidden_origin", "Origin not allowed"));
  };
}
