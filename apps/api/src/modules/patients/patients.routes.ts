import { Router } from "express";
import { createPatientSchema, updatePatientSchema } from "@nutriapp/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireRole } from "../../middleware/require-role.js";
import { validate } from "../../middleware/validate.js";
import { create, getOne, list, update } from "./patients.controller.js";

export function createPatientsRouter() {
  const router = Router();

  // One line protects every rote of the module: nothing here is public
  router.use(requireAuth);

  router.post("/", requireRole("nutritionist"), validate(createPatientSchema), create);
  router.get("/", requireRole("nutritionist"), list);
  router.get("/:id", requireRole("nutritionist", "patient"), getOne);
  router.patch("/:id", requireRole("nutritionist"), validate(updatePatientSchema), update);

  return router;
}
