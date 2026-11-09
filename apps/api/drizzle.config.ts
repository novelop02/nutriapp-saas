import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // sin archivo .env: se usan las variables que ya tenga el entorno
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
