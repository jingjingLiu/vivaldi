import type { RequestHandler } from 'express';
import { z, type ZodSchema } from 'zod';
import { HttpError } from '../errors/HttpError.js';

export interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: Array<{ at: 'body' | 'query' | 'params'; path: (string | number)[]; message: string }> = [];

    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ at: key, path: issue.path, message: issue.message });
        }
      } else {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      }
    }

    if (issues.length > 0) {
      return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed', issues));
    }
    next();
  };
}

export type { ZodSchema };
void z;
