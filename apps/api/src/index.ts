import { sql } from "drizzle-orm";
import { APP_NAME } from "@nutriapp/shared";
import { env } from "./config/env.js";
import { db } from "./db/client.js";

const result = await db.execute(sql`select 1 as ok`);
console.log(`Hola desde ${APP_NAME} desde el puerto ${env.PORT}. Base de datos:`, result.rows);
