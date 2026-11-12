import { Router } from "express";
import { createPatientSchema, updatePatientSchema } from "@nutriapp/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireRole } from "../../middleware/require-role.js";
import { validate } from "../../middleware/validate.js";
import { create, getOne, list, update } from "./patients.controller.js";
import type { InvitationHandlers } from "../invitations/invitations.controller.js";

export function createPatientsRouter(invitations: InvitationHandlers): Router {
  const router = Router();

  // One line protects every rote of the module: nothing here is public
  router.use(requireAuth);

  router.post("/", requireRole("nutritionist"), validate(createPatientSchema), create);
  router.get("/", requireRole("nutritionist"), list);
  router.get("/:id", requireRole("nutritionist", "patient"), getOne);
  router.patch("/:id", requireRole("nutritionist"), validate(updatePatientSchema), update);
  router.post("/:id/invitations", requireRole("nutritionist"), invitations.send);

  return router;
}
