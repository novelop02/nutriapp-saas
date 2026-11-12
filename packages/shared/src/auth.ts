import z from "zod";

export const roleSchema = z.enum(["nutritionist", "patient", "admin"]);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const registerSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z
    .string()
    .min(12, "must have at least 12 characters")
    .max(128, "cannot have more than 128 characters")
    .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "must include letters and numbers"),
});

// Login does not repeat the password policy: it should not reveal the rules to an attacker
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, "required").max(128),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(["nutritionist", "patient", "admin"]),
});

export type Role = z.infer<typeof roleSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
