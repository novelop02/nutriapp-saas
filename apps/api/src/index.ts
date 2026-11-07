import { APP_NAME } from "@nutriapp/shared";
import { env } from "./config/env.js";

console.log(`Hola desde ${APP_NAME} desde el puerto ${env.PORT}`);
