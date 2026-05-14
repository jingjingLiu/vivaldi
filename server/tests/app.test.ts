import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('app factory', () => {
  it('returns an Express app that responds to unknown routes with 404 JSON', async () => {
    const app = createApp();
    const res = await request(app).get('/this-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('sets helmet security headers', async () => {
    const app = createApp();
    const res = await request(app).get('/this-does-not-exist');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns JSON content-type for errors', async () => {
    const app = createApp();
    const res = await request(app).get('/this-does-not-exist');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
