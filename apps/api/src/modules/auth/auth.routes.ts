import { Router } from "express";
import { authUserSchema, registerSchema, type RegisterInput } from "@nutriapp/shared";
import { validate } from "../../middleware/validate.js";
import { registerNutritionist } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const input: RegisterInput = req.body;
  const user = await registerNutritionist(input);
  res.status(201).json({ user: authUserSchema.parse(user) });
});
