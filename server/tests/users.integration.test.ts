import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

// Unique suffix to isolate test data
const SUFFIX = `users_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

let adminCookie: string;
let screenerCookie: string;
let createdUserId: number;

const app = createApp();

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  const cookie = extractCookie(res);
  expect(cookie).toBeDefined();
  return cookie!;
}

// -----------------------------------------------------------------------
// Setup / Teardown
// -----------------------------------------------------------------------

beforeAll(async () => {
  // Create a coordinator used only for auth in these tests
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Test Coordinator',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Create a screener used to verify 403 on non-coordinator
  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Test Screener',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  adminCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');
});

afterAll(async () => {
  // Clean up users created during tests (by username prefix)
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `new_${SUFFIX}` } } });
  if (createdUserId) {
    await prisma.user.deleteMany({ where: { id: createdUserId } });
  }
  await disconnectPrisma();
});

// -----------------------------------------------------------------------
// Auth enforcement
// -----------------------------------------------------------------------

describe('Auth enforcement on /users', () => {
  it('GET /users returns 401 without cookie', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });

  it('GET /users returns 403 with non-coordinator cookie', async () => {
    const res = await request(app).get('/users').set('Cookie', [screenerCookie]);
    expect(res.status).toBe(403);
  });

  it('POST /users returns 401 without cookie', async () => {
    const res = await request(app).post('/users').send({});
    expect(res.status).toBe(401);
  });

  it('POST /users returns 403 with screener cookie', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [screenerCookie])
      .send({ username: 'x', password: 'y', name: 'z', roles: ['screener'] });
    expect(res.status).toBe(403);
  });
});

// -----------------------------------------------------------------------
// POST /users — create
// -----------------------------------------------------------------------

describe('POST /users', () => {
  it('[TC-1.1-001] creates a user and returns 201 with serialized user (no passwordHash)', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({
        username: `new_${SUFFIX}_a`,
        password: 'Secure1234',
        name: 'Alice Test',
        roles: ['screener', 'interviewer'],
        locale: 'en',
      });

    expect(res.status).toBe(201);
    const { user } = res.body as { user: Record<string, unknown> };
    expect(user.username).toBe(`new_${SUFFIX}_a`);
    expect(user.name).toBe('Alice Test');
    expect(user.enabled).toBe(true);
    expect(user.locale).toBe('en');
    expect(Array.isArray(user.roles)).toBe(true);
    expect((user.roles as string[]).sort()).toEqual(['interviewer', 'screener']);
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password_hash');
    createdUserId = user.id as number;
  });

  it('[TC-1.1-009] returns 409 USERNAME_TAKEN when username already exists', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({
        username: `new_${SUFFIX}_a`,
        password: 'Secure1234',
        name: 'Duplicate',
        roles: ['screener'],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('[TC-1.1-010] returns 400 VALIDATION_ERROR for username too short', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({ username: 'ab', password: 'Secure1234', name: 'Short', roles: ['screener'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.1-010] returns 400 VALIDATION_ERROR for password too short', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({ username: `new_${SUFFIX}_b`, password: 'short', name: 'Pwd Short', roles: ['screener'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.1-011] returns 400 VALIDATION_ERROR for empty roles array', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({ username: `new_${SUFFIX}_c`, password: 'Secure1234', name: 'No Roles', roles: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.1-010] returns 400 VALIDATION_ERROR for invalid role value', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({ username: `new_${SUFFIX}_d`, password: 'Secure1234', name: 'Bad Role', roles: ['admin'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.1-010] returns 400 VALIDATION_ERROR for invalid username chars', async () => {
    const res = await request(app)
      .post('/users')
      .set('Cookie', [adminCookie])
      .send({ username: 'UPPER_CASE', password: 'Secure1234', name: 'Bad Username', roles: ['screener'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// -----------------------------------------------------------------------
// GET /users — list
// -----------------------------------------------------------------------

describe('GET /users', () => {
  it('[TC-1.1-014] returns paginated list with items, total, page, pageSize', async () => {
    const res = await request(app).get('/users').set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.page).toBe(1);
    expect(typeof body.pageSize).toBe('number');
  });

  it('[TC-1.1-001] items never contain passwordHash', async () => {
    const res = await request(app).get('/users').set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    const { items } = res.body as { items: Record<string, unknown>[] };
    for (const user of items) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password_hash');
    }
  });

  it('[TC-1.1-014] supports pageSize and page params', async () => {
    const res = await request(app)
      .get('/users?page=1&pageSize=2')
      .set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
  });

  it('[TC-1.1-008] filters by role', async () => {
    const res = await request(app)
      .get('/users?role=screener')
      .set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    const { items } = res.body as { items: { roles: string[] }[] };
    for (const user of items) {
      expect(user.roles).toContain('screener');
    }
  });

  it('[TC-1.1-008] supports search by q (username/name)', async () => {
    const res = await request(app)
      .get(`/users?q=new_${SUFFIX}`)
      .set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    const { items } = res.body as { items: { username: string }[] };
    expect(items.length).toBeGreaterThan(0);
    for (const user of items) {
      expect(user.username).toContain(`new_${SUFFIX}`);
    }
  });
});

// -----------------------------------------------------------------------
// GET /users/:id
// -----------------------------------------------------------------------

describe('GET /users/:id', () => {
  it('[TC-1.1-003] returns a single user', async () => {
    const res = await request(app)
      .get(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie]);
    expect(res.status).toBe(200);
    const { user } = res.body as { user: Record<string, unknown> };
    expect(user.id).toBe(createdUserId);
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password_hash');
  });

  it('[TC-1.1-013] returns 404 NOT_FOUND for non-existent id', async () => {
    const res = await request(app)
      .get('/users/999999999')
      .set('Cookie', [adminCookie]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('[TC-1.1-001] returns 401 without cookie', async () => {
    const res = await request(app).get(`/users/${createdUserId}`);
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// PATCH /users/:id
// -----------------------------------------------------------------------

describe('PATCH /users/:id', () => {
  it('[TC-1.1-003] updates name', async () => {
    const res = await request(app)
      .patch(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie])
      .send({ name: 'Alice Updated' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Alice Updated');
  });

  it('[TC-1.1-006] toggles enabled to false', async () => {
    const res = await request(app)
      .patch(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie])
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.user.enabled).toBe(false);
  });

  it('[TC-1.1-007] toggles enabled back to true', async () => {
    const res = await request(app)
      .patch(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie])
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.user.enabled).toBe(true);
  });

  it('[TC-1.1-002] replaces roles atomically', async () => {
    const res = await request(app)
      .patch(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie])
      .send({ roles: ['coordinator'] });
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(['coordinator']);
  });

  it('[TC-1.1-013] returns 404 for non-existent id', async () => {
    const res = await request(app)
      .patch('/users/999999999')
      .set('Cookie', [adminCookie])
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('[TC-1.1-003] never returns passwordHash', async () => {
    const res = await request(app)
      .patch(`/users/${createdUserId}`)
      .set('Cookie', [adminCookie])
      .send({ name: 'No Hash Please' });
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

// -----------------------------------------------------------------------
// POST /users/:id/password — reset password
// -----------------------------------------------------------------------

describe('POST /users/:id/password', () => {
  it('[TC-1.1-004] resets password and new password verifies correctly', async () => {
    const newPassword = 'NewPassw0rd!';
    const res = await request(app)
      .post(`/users/${createdUserId}/password`)
      .set('Cookie', [adminCookie])
      .send({ password: newPassword });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the hash in DB matches new password
    const user = await prisma.user.findUnique({ where: { id: createdUserId } });
    expect(user).not.toBeNull();
    const valid = await verifyPassword(newPassword, user!.passwordHash);
    expect(valid).toBe(true);
  });

  it('[TC-1.1-010] returns 400 for password too short', async () => {
    const res = await request(app)
      .post(`/users/${createdUserId}/password`)
      .set('Cookie', [adminCookie])
      .send({ password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.1-013] returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/users/999999999/password')
      .set('Cookie', [adminCookie])
      .send({ password: 'ValidPass123' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('[TC-1.1-004] returns 401 without cookie', async () => {
    const res = await request(app)
      .post(`/users/${createdUserId}/password`)
      .send({ password: 'ValidPass123' });
    expect(res.status).toBe(401);
  });
});
