import { Router } from "express";
import { loginSchema, registerSchema } from "@nutriapp/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validate } from "../../middleware/validate.js";
import type { AuthLimiters } from "./auth.limits.js";
import { login, logout, logoutAll, refresh, register } from "./auth.controller.js";

export function createAuthRouter(limiters: AuthLimiters) {
  const router = Router();

  router.post("/register", limiters.registerByIp, validate(registerSchema), register);
  router.post("/login", limiters.loginByIp, validate(loginSchema), limiters.loginByEmail, login);
  router.post("/refresh", limiters.refreshByIp, refresh);
  router.post("/logout", logout);
  router.post("/logout-all", requireAuth, logoutAll);

  return router;
}
