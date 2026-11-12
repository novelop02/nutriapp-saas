import type { Request, Response } from "express";
import {
  listPatientsQuerySchema,
  patientForPatientSchema,
  patientSchema,
  type CreatePatientInput,
  type UpdatePatientInput,
} from "@nutriapp/shared";
import { parseIdOrNotFound, parseInput } from "../../lib/parse.js";
import { actorFrom } from "../../policies/actor.js";
import { toPatientDto } from "./patients.dto.js";
import { createPatient, getPatient, listPatients, updatePatient } from "./patients.service.js";

export async function create(req: Request, res: Response) {
  const actor = actorFrom(req);
  const input: CreatePatientInput = req.body;
  const row = await createPatient(actor, input);
  res.status(201).json({ patient: patientSchema.parse(toPatientDto(row)) });
}

export async function list(req: Request, res: Response) {
  const actor = actorFrom(req);
  const query = parseInput(listPatientsQuerySchema, req.query);
  const { items, hasMore } = await listPatients(actor, query);
  res.json({
    items: items.map((row) => patientSchema.parse(toPatientDto(row))),
    limit: query.limit,
    offset: query.offset,
    hasMore,
  });
}

export async function getOne(req: Request, res: Response) {
  const actor = actorFrom(req);
  const row = await getPatient(actor, parseIdOrNotFound(req.params.id));
  const dto = toPatientDto(row);
  // The response shape depends on who asks: patients do not get the private notes
  const patient =
    actor.role === "patient" ? patientForPatientSchema.parse(dto) : patientSchema.parse(dto);
  res.json({ patient });
}

export async function update(req: Request, res: Response) {
  const actor = actorFrom(req);
  const input: UpdatePatientInput = req.body;
  const row = await updatePatient(actor, parseIdOrNotFound(req.params.id), input);
  res.json({ patient: patientSchema.parse(toPatientDto(row)) });
}
