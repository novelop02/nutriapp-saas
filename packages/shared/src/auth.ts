import z from "zod";

export const registerSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z
    .string()
    .min(12, "must have at least 12 characters")
    .max(128, "cannot have more than 128 characters")
    .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "must include letters and numbers"),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(["nutritionist", "patient", "admin"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
