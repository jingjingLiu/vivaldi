import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/things',
    validate({ body: z.object({ name: z.string().min(1), age: z.number().int().positive() }) }),
    (req, res) => res.json({ received: req.body }),
  );
  app.get(
    '/search',
    validate({ query: z.object({ q: z.string().min(1) }) }),
    (req, res) => res.json({ q: req.query.q }),
  );
  app.use(errorHandler);
  return app;
}

describe('middleware/validate', () => {
  it('passes through when body is valid', async () => {
    const res = await request(buildApp()).post('/things').send({ name: 'a', age: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: { name: 'a', age: 5 } });
  });

  it('returns 400 VALIDATION_ERROR with field issues when body is invalid', async () => {
    const res = await request(buildApp()).post('/things').send({ name: '', age: -1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('validates query strings', async () => {
    const ok = await request(buildApp()).get('/search').query({ q: 'hi' });
    expect(ok.status).toBe(200);

    const bad = await request(buildApp()).get('/search');
    expect(bad.status).toBe(400);
  });
});
