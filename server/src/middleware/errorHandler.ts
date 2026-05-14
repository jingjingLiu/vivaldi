import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../errors/HttpError.js';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Convert multer errors to HttpErrors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const httpErr = new HttpError(400, 'FILE_TOO_LARGE', 'File exceeds the maximum allowed size of 10 MB');
      res.status(httpErr.statusCode).json(httpErr.toJSON());
      return;
    }
    const httpErr = new HttpError(400, 'UPLOAD_ERROR', err.message);
    res.status(httpErr.statusCode).json(httpErr.toJSON());
    return;
  }

  if (err instanceof HttpError) {
    logger.warn({ err, path: req.path }, 'http error');
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
