import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";

const server = createApp().listen(env.PORT, () => {
  console.log(`API esuchando en http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
