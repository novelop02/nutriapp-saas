import type { Request, Response } from "express";
import {
  authUserSchema,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from "@nutriapp/shared";
import { AppError } from "../../errors.js";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../../lib/cookies.js";
import { signAccessToken } from "../../lib/tokens.js";
import { authenticate, getAuthUserById, registerNutritionist } from "./auth.service.js";
import { actorFrom } from "../../policies/actor.js";
import {
  createSession,
  invalidRefreshError,
  RefreshTokenReuseError,
  revokeAllUserSessions,
  revokeSessionByToken,
  rotateSession,
  type SessionMeta,
} from "./session.service.js";
import { SecurityEvent } from "../../lib/security-events.js";

function sessionMeta(req: Request): SessionMeta {
  return {
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
  };
}

async function startSession(req: Request, res: Response, user: AuthUser) {
  const refreshToken = await createSession(user, sessionMeta(req));
  setAuthCookies(res, await signAccessToken(user), refreshToken);
}

export async function register(req: Request, res: Response) {
  const input: RegisterInput = req.body;
  const user = await registerNutritionist(input);
  await startSession(req, res, user);

  res.set("Cache-Control", "no-store");
  res.status(201).json({ user: authUserSchema.parse(user) });
}

export async function login(req: Request, res: Response) {
  const input: LoginInput = req.body;
  const user = await authenticate(input);
  await startSession(req, res, user);

  res.set("Cache-Control", "no-store");
  res.json({ user: authUserSchema.parse(user) });
}

export async function refresh(req: Request, res: Response) {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== "string") throw invalidRefreshError();

  try {
    const { user, refreshToken } = await rotateSession(token, sessionMeta(req));
    setAuthCookies(res, await signAccessToken(user), refreshToken);

    res.set("Cache-Control", "no-store");
    res.json({ user: authUserSchema.parse(user) });
  } catch (err) {
    if (err instanceof RefreshTokenReuseError) {
      req.log.warn(
        { event: SecurityEvent.RefreshTokenReuse, familyId: err.familyId },
        "Refresh token reuse detected, family revoked",
      );
    }
    // A failed refresh leaves the client without a session: clear the stale cookies
    if (err instanceof AppError && err.status === 401) clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  // No access token needed: logging out must work even if it already expired
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === "string") await revokeSessionByToken(token);

  clearAuthCookies(res);
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response) {
  const actor = actorFrom(req);
  await revokeAllUserSessions(actor.userId);

  clearAuthCookies(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const actor = actorFrom(req);

  // Se consulta la base de datos: un token valido de un usuario ya borrado no debe servir
  const user = await getAuthUserById(actor.userId);
  if (!user) throw new AppError(401, "unauthenticated", "Authentication required");

  res.set("Cache-Control", "no-store");
  res.json({ user: authUserSchema.parse(user) });
}
