import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  process.loadEnvFile(".env.test");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no esta definida en .env.test");

  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Las pruebas solo corren en bases que terminan en _test (recibido: ${dbName})`);
  }

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
