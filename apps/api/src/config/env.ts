import z from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, "has to have at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("ENV variables not valid: ");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
