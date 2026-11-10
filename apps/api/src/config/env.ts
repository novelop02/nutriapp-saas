import z from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, "has to have at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.url())
        .refine(
          (origins) => origins.every((origin) => new URL(origin).origin === origin),
          "each origin must look like https://host[:port], without a path or trailing slash",
        ),
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("ENV variables not valid: ");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
