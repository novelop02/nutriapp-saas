import { z } from "zod";
import { emailSchema } from "./auth.js";

const nameSchema = z.string().trim().min(1, "required").max(100);

const todayIso = () => new Date().toISOString().slice(0, 10);

// ISO dates (YYYY-MM-DD) compare correctly as text
const birthDateSchema = z.iso
  .date()
  .refine((date) => date <= todayIso(), "cannot be in the future")
  .refine((date) => date >= "1900-01-01", "must be after 1900");

const text = (max: number) => z.string().trim().max(max);

export const createPatientSchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  birthDate: birthDateSchema.optional(),
  goal: text(500).optional(),
  allergies: text(1000).optional(),
  notes: text(5000).optional(),
});

// Email is not editable: it identifies the patient for the invitation.
// null clears an optional field.
export const updatePatientSchema = z
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    birthDate: birthDateSchema.nullable().optional(),
    goal: text(500).nullable().optional(),
    allergies: text(1000).nullable().optional(),
    notes: text(5000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "send at least one field");

export const listPatientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  birthDate: z.string().nullable(),
  goal: z.string().nullable(),
  allergies: z.string().nullable(),
  notes: z.string().nullable(),
  linked: z.boolean(), // has the patient accepted the invitation?
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// What a patient sees of their own record: no private clinical notes
export const patientForPatientSchema = patientSchema.omit({ notes: true });

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type PatientDto = z.infer<typeof patientSchema>;
