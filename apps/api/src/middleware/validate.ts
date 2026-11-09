import type { RequestHandler } from "express";
import z from "zod";
import { AppError } from "../errors.js";

export function validate(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);
      return next(new AppError(400, "validation_error", "Invalid Data", fieldErrors));
    }
    req.body = result.data;
    next(1);
  };
}
