import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requireAuth } from "./middleware/require-auth.js";
import { me } from "./modules/auth/auth.controller.js";
import { authRouter } from "./modules/auth/auth.routes.js";

// The logger is injectable so tests can capture what gets written
export function createApp(log: Logger = logger) {
  const app = express();
  app.disable("x-powered-by");

  // First middleware: every later error already has req.log and a request id
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

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", authRouter);
  app.use("/me", requireAuth, me);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
