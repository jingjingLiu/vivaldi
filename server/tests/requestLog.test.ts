import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestLog } from '../src/middleware/requestLog.js';

describe('middleware/requestLog', () => {
  it('attaches a per-request logger to req.log', async () => {
    const app = express();
    app.use(requestLog);
    app.get('/ping', (req, res) => {
      expect((req as unknown as { log?: unknown }).log).toBeDefined();
      res.json({ ok: true });
    });

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('is a valid express middleware function', () => {
    expect(typeof requestLog).toBe('function');
    expect(requestLog.length).toBeGreaterThanOrEqual(2);
    vi.resetModules();
  });
});
