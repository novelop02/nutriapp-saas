import { Router } from "express";
import { authUserSchema, registerSchema, type RegisterInput } from "@nutriapp/shared";
import { validate } from "../../middleware/validate.js";
import { registerNutricionist } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const input: RegisterInput = req.body;
  const user = await registerNutricionist(input);
  res.status(201).json({ user: authUserSchema.parse(user) });
});
