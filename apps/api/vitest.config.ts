import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: parseEnv(readFileSync(".env.test", "utf8")),
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
  },
});
