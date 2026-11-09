import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors.js";

function hasClientStatus(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 500
  );
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (hasClientStatus(err)) {
    res.status(err.status).json({ error: { code: "bad_request", message: "Bad request" } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Internal error" } });
};
