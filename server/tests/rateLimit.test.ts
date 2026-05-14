import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLoginRateLimiter } from '../src/middleware/rateLimit.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/login', createLoginRateLimiter({ limit: 3, windowMs: 60_000 }), (_req, res) => {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'nope' });
  });
  return app;
}

describe('middleware/rateLimit', () => {
  it('allows up to max requests, then blocks with 429', async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/login').send({});
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/login').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});
