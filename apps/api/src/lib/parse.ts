import { z } from "zod";
import { AppError } from "../errors.js";

// For data validate() cannot reach: query strings (read-only in Express 5) and params
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "validation_error", "Invalid data", z.flattenError(result.error));
  }
  return result.data;
}

// An id that is not a UUID cannot exist: answer 404, and never let Postgres
// reject it, because that would surface as a 500
export function parseIdOrNotFound(value: unknown): string {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new AppError(404, "not_found", "Resource not found");
  return result.data;
}
