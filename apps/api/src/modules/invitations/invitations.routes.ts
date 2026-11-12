import { Router } from "express";
import { acceptInvitationSchema } from "@nutriapp/shared";
import { validate } from "../../middleware/validate.js";
import type { InvitationHandlers } from "./invitations.controller.js";

export function createInvitationsRouter(handlers: InvitationHandlers): Router {
  const router = Router();
  router.post("/accept", validate(acceptInvitationSchema), handlers.accept); // public
  return router;
}
