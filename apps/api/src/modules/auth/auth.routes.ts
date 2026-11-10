import { Router } from "express";
import { loginSchema, registerSchema } from "@nutriapp/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validate } from "../../middleware/validate.js";
import { login, logout, logoutAll, refresh, register } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.post("/logout-all", requireAuth, logoutAll);
