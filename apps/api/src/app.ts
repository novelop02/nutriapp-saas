import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requireAuth } from "./middleware/require-auth.js";
import { corsPolicy, originGuard, securityHeaders } from "./middleware/security.js";
import { me } from "./modules/auth/auth.controller.js";
import { redisRateLimitStore } from "./lib/redis.js";
import type { RateLimitStore } from "./lib/rate-limit.js";
import { createAuthLimiters, noLimiters } from "./modules/auth/auth.limits.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";

export type AppOptions = {
  rateLimit?: boolean; // defaults to env.RATE_LIMIT_ENABLED
  rateLimitStore?: RateLimitStore; // tests inject a fake
};

// The logger is injectable so tests can capture what gets written
export function createApp(log: Logger = logger, opts: AppOptions = {}) {
  const limiters =
    (opts.rateLimit ?? env.RATE_LIMIT_ENABLED)
      ? createAuthLimiters(opts.rateLimitStore ?? redisRateLimitStore)
      : noLimiters;
  const app = express();
  app.disable("x-powered-by");

  // First: every later middleware and error already has req.log and a request id
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );

  app.use(securityHeaders({ hsts: env.NODE_ENV === "production" }));
  app.use(corsPolicy(env.ALLOWED_ORIGINS));
  app.use(originGuard(env.ALLOWED_ORIGINS));

  app.use("/auth", express.json({ limit: "10kb" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter(limiters));
  app.get("/me", requireAuth, me);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
