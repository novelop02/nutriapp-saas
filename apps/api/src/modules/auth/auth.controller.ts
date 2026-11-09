import type { Request, Response } from "express";
import { authUserSchema, type LoginInput, type RegisterInput } from "@nutriapp/shared";
import { AppError } from "../../errors.js";
import { accessCookieOptions, ACCESS_COOKIE } from "../../lib/cookies.js";
import { signAccessToken } from "../../lib/tokens.js";
import { authenticate, getAuthUserById, registerNutritionist } from "./auth.service.js";

export async function register(req: Request, res: Response) {
  const input: RegisterInput = req.body;
  const user = await registerNutritionist(input);
  res.status(201).json({ user: authUserSchema.parse(user) });
}

export async function login(req: Request, res: Response) {
  const input: LoginInput = req.body;
  const user = await authenticate(input);
  const token = await signAccessToken(user);

  res.cookie(ACCESS_COOKIE, token, accessCookieOptions());
  res.set("Cache-Control", "no-store");
  res.json({ user: authUserSchema.parse(user) });
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, "unauthenticated", "Authentication required");

  // Se consulta la base de datos: un token valido de un usuario ya borrado no debe servir
  const user = await getAuthUserById(req.auth.userId);
  if (!user) throw new AppError(401, "unauthenticated", "Authentication required");

  res.set("Cache-Control", "no-store");
  res.json({ user: authUserSchema.parse(user) });
}
