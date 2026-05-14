import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

describe('middleware/auth', () => {
  async function buildApp() {
    vi.stubEnv('JWT_SECRET', 'test_jwt_secret_do_not_use_in_prod');
    vi.stubEnv('JWT_EXPIRES_IN', '1h');
    const { signToken } = await import('../src/lib/jwt.js');
    const { requireAuth, AUTH_COOKIE_NAME } = await import('../src/middleware/auth.js');
    const { errorHandler } = await import('../src/middleware/errorHandler.js');

    const app = express();
    app.use(cookieParser());
    app.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
    app.use(errorHandler);
    return { app, signToken, AUTH_COOKIE_NAME };
  }

  it('attaches req.user when a valid JWT cookie is present', async () => {
    const { app, signToken, AUTH_COOKIE_NAME } = await buildApp();
    const token = signToken({ userId: 7, roles: ['coordinator'], kind: 'internal' });
    const res = await request(app).get('/me').set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ userId: 7, roles: ['coordinator'], kind: 'internal' });
  });

  it('returns 401 UNAUTHENTICATED when cookie is missing', async () => {
    const { app } = await buildApp();
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 UNAUTHENTICATED when cookie is invalid', async () => {
    const { app, AUTH_COOKIE_NAME } = await buildApp();
    const res = await request(app).get('/me').set('Cookie', [`${AUTH_COOKIE_NAME}=not-a-real-jwt`]);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});
