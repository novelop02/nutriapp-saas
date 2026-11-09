import type { Role } from "@nutriapp/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export {};
