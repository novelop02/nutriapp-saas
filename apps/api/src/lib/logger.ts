import { pino, type LoggerOptions } from "pino";
import { env } from "../config/env.js";

// Never log secrets: these paths are replaced before anything is written
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
};

export const logger = pino(
  env.NODE_ENV === "development"
    ? { ...loggerOptions, transport: { target: "pino-pretty" } }
    : loggerOptions,
);
