import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { me } from "./modules/auth/auth.controller.js";
import { requireAuth } from "./middleware/require-auth.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
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
