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
import { authRouter } from "./modules/auth/auth.routes.js";

// The logger is injectable so tests can capture what gets written
export function createApp(log: Logger = logger) {
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
  app.use("/auth", authRouter);
  app.get("/me", requireAuth, me);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
