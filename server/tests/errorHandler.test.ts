import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { HttpError } from '../src/errors/HttpError.js';

function buildApp(throwFn: () => never) {
  const app = express();
  app.get('/boom', (_req, _res, next) => {
    try { throwFn(); } catch (e) { next(e); }
  });
  app.use(errorHandler);
  return app;
}

describe('middleware/errorHandler', () => {
  it('maps HttpError to its statusCode and JSON body', async () => {
    const app = buildApp(() => { throw new HttpError(404, 'NOT_FOUND', 'missing'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'missing' });
  });

  it('maps unknown Error to 500 INTERNAL_ERROR without leaking stack', async () => {
    const app = buildApp(() => { throw new Error('oops secret'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Internal server error');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('includes details when HttpError has them', async () => {
    const app = buildApp(() => {
      throw new HttpError(400, 'VALIDATION_ERROR', 'bad input', { field: 'email' });
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ field: 'email' });
  });
});
