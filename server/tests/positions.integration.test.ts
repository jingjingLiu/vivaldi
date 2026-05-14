import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

// Unique suffix to isolate test data
const SUFFIX = `pos_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

let coordCookie: string;
let screenerCookie: string;
let interviewerUserId: number;

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
  // Create coordinator
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Coord Position Tests',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Create screener (non-coordinator, for 403 tests)
  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Screener Position Tests',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  // Create an interviewer user for assignment tests
  const interviewer = await prisma.user.create({
    data: {
      username: `interviewer_${SUFFIX}`,
      passwordHash: await hashPassword('Interview1!'),
      name: 'Interviewer Position Tests',
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewerUserId = interviewer.id;

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');
});

afterAll(async () => {
  // Clean up positions created during test (by name prefix)
  await prisma.position.deleteMany({ where: { name: { startsWith: `pos_${SUFFIX}` } } });
  // Clean up users
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `interviewer_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `noninterviewer_${SUFFIX}` } } });
  await disconnectPrisma();
});

// -----------------------------------------------------------------------
// Auth enforcement
// -----------------------------------------------------------------------

describe('Auth enforcement on /positions', () => {
  it('GET /positions returns 401 without cookie', async () => {
    const res = await request(app).get('/positions');
    expect(res.status).toBe(401);
  });

  it('GET /positions returns 403 with non-coordinator cookie', async () => {
    const res = await request(app).get('/positions').set('Cookie', [screenerCookie]);
    expect(res.status).toBe(403);
  });

  it('POST /positions returns 401 without cookie', async () => {
    const res = await request(app).post('/positions').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('POST /positions returns 403 with screener cookie', async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [screenerCookie])
      .send({ name: 'Test' });
    expect(res.status).toBe(403);
  });

  it('DELETE /positions/:id returns 401 without cookie', async () => {
    const res = await request(app).delete('/positions/1');
    expect(res.status).toBe(401);
  });

  it('PATCH /positions/:id returns 401 without cookie', async () => {
    const res = await request(app).patch('/positions/1').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// POST /positions — create
// -----------------------------------------------------------------------

describe('POST /positions — create', () => {
  it('[TC-1.2-001] creates a position with no interviewers and returns 201', async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_a` });

    expect(res.status).toBe(201);
    const { position } = res.body as { position: Record<string, unknown> };
    expect(position.name).toBe(`pos_${SUFFIX}_a`);
    expect(position.candidateCount).toBe(0);
    expect(position.hasOaForm).toBe(false);
    expect(Array.isArray(position.interviewers)).toBe(true);
    expect((position.interviewers as unknown[]).length).toBe(0);
    expect(position).toHaveProperty('id');
    expect(position).toHaveProperty('createdAt');
    expect(position).toHaveProperty('updatedAt');
  });

  it('[TC-1.2-002] creates a position with valid interviewers', async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_b`, interviewerIds: [interviewerUserId] });

    expect(res.status).toBe(201);
    const { position } = res.body as { position: Record<string, unknown> };
    expect(position.name).toBe(`pos_${SUFFIX}_b`);
    const interviewers = position.interviewers as { id: number; username: string; name: string }[];
    expect(interviewers.length).toBe(1);
    expect(interviewers[0].id).toBe(interviewerUserId);
    expect(interviewers[0].username).toBe(`interviewer_${SUFFIX}`);
  });

  it('[TC-1.2-009] returns 400 INVALID_INTERVIEWER_IDS when interviewer id does not exist', async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_bad`, interviewerIds: [999999999] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INTERVIEWER_IDS');
  });

  it('[TC-1.2-009] returns 400 INVALID_INTERVIEWER_IDS when user lacks interviewer role', async () => {
    // Create a user without interviewer role
    const nonInterviewer = await prisma.user.create({
      data: {
        username: `noninterviewer_${SUFFIX}`,
        passwordHash: await hashPassword('Test1234!'),
        name: 'Non Interviewer',
        roles: { create: [{ role: Role.screener }] },
      },
    });

    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_norole`, interviewerIds: [nonInterviewer.id] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INTERVIEWER_IDS');
  });

  it('[TC-1.2-007] returns 400 VALIDATION_ERROR for empty name', async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// -----------------------------------------------------------------------
// GET /positions — list with pagination + search
// -----------------------------------------------------------------------

describe('GET /positions — list', () => {
  it('[TC-1.2-014] returns paginated list with items, total, page, pageSize', async () => {
    const res = await request(app).get('/positions').set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.page).toBe(1);
    expect(typeof body.pageSize).toBe('number');
  });

  it('[TC-1.2-014] supports pageSize and page params', async () => {
    const res = await request(app)
      .get('/positions?page=1&pageSize=2')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
  });

  it('[TC-1.2-006] supports search by q (name)', async () => {
    const res = await request(app)
      .get(`/positions?q=pos_${SUFFIX}`)
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    const { items } = res.body as { items: { name: string }[] };
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.name).toContain(`pos_${SUFFIX}`);
    }
  });

  it('[TC-1.2-010,TC-1.2-011] summary items have candidateCount and hasOaForm', async () => {
    const res = await request(app)
      .get(`/positions?q=pos_${SUFFIX}_a`)
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    const { items } = res.body as { items: Record<string, unknown>[] };
    expect(items.length).toBeGreaterThan(0);
    const item = items[0];
    expect(typeof item.candidateCount).toBe('number');
    expect(typeof item.hasOaForm).toBe('boolean');
    expect(typeof item.interviewerCount).toBe('number');
  });
});

// -----------------------------------------------------------------------
// GET /positions/:id
// -----------------------------------------------------------------------

describe('GET /positions/:id', () => {
  let positionId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_getbyid`, interviewerIds: [interviewerUserId] });
    positionId = (res.body as { position: { id: number } }).position.id;
  });

  it('[TC-1.2-002] returns position detail with interviewers array', async () => {
    const res = await request(app)
      .get(`/positions/${positionId}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { position } = res.body as { position: Record<string, unknown> };
    expect(position.id).toBe(positionId);
    expect(Array.isArray(position.interviewers)).toBe(true);
    const interviewers = position.interviewers as { id: number; username: string; name: string }[];
    expect(interviewers.length).toBe(1);
    expect(interviewers[0].id).toBe(interviewerUserId);
    expect(position).toHaveProperty('candidateCount');
    expect(position).toHaveProperty('hasOaForm');
    expect(position).toHaveProperty('updatedAt');
  });

  it('[TC-1.2-007] returns 404 NOT_FOUND for non-existent id', async () => {
    const res = await request(app)
      .get('/positions/999999999')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// -----------------------------------------------------------------------
// PATCH /positions/:id
// -----------------------------------------------------------------------

describe('PATCH /positions/:id', () => {
  let positionId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_patch` });
    positionId = (res.body as { position: { id: number } }).position.id;
  });

  it('[TC-1.2-003] renames a position', async () => {
    const newName = `pos_${SUFFIX}_patch_renamed`;
    const res = await request(app)
      .patch(`/positions/${positionId}`)
      .set('Cookie', [coordCookie])
      .send({ name: newName });

    expect(res.status).toBe(200);
    const { position } = res.body as { position: { name: string } };
    expect(position.name).toBe(newName);
  });

  it('[TC-1.2-003] replaces interviewers set atomically', async () => {
    // First, assign interviewer
    const res1 = await request(app)
      .patch(`/positions/${positionId}`)
      .set('Cookie', [coordCookie])
      .send({ interviewerIds: [interviewerUserId] });
    expect(res1.status).toBe(200);
    const interviewers1 = (res1.body as { position: { interviewers: unknown[] } }).position.interviewers;
    expect(interviewers1.length).toBe(1);

    // Now replace with empty set
    const res2 = await request(app)
      .patch(`/positions/${positionId}`)
      .set('Cookie', [coordCookie])
      .send({ interviewerIds: [] });
    expect(res2.status).toBe(200);
    const interviewers2 = (res2.body as { position: { interviewers: unknown[] } }).position.interviewers;
    expect(interviewers2.length).toBe(0);
  });

  it('[TC-1.2-003] returns 404 for non-existent id', async () => {
    const res = await request(app)
      .patch('/positions/999999999')
      .set('Cookie', [coordCookie])
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('[TC-1.2-009] returns 400 INVALID_INTERVIEWER_IDS for bad interviewerIds on patch', async () => {
    const res = await request(app)
      .patch(`/positions/${positionId}`)
      .set('Cookie', [coordCookie])
      .send({ interviewerIds: [999999999] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INTERVIEWER_IDS');
  });
});

// -----------------------------------------------------------------------
// DELETE /positions/:id
// -----------------------------------------------------------------------

describe('DELETE /positions/:id', () => {
  it('[TC-1.2-004] deletes a position with no candidates', async () => {
    const createRes = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_delete_ok` });
    const id = (createRes.body as { position: { id: number } }).position.id;

    const res = await request(app)
      .delete(`/positions/${id}`)
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify it's gone
    const getRes = await request(app)
      .get(`/positions/${id}`)
      .set('Cookie', [coordCookie]);
    expect(getRes.status).toBe(404);
  });

  it('[TC-1.2-012] returns 409 HAS_CANDIDATES when candidates exist', async () => {
    // Create a position
    const createRes = await request(app)
      .post('/positions')
      .set('Cookie', [coordCookie])
      .send({ name: `pos_${SUFFIX}_delete_blocked` });
    const posId = (createRes.body as { position: { id: number } }).position.id;

    // Seed a candidate directly
    await prisma.candidate.create({
      data: {
        positionId: posId,
        oneTimeCode: `P${Date.now().toString(36).toUpperCase().slice(-7)}`,
      },
    });

    const res = await request(app)
      .delete(`/positions/${posId}`)
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HAS_CANDIDATES');

    // Cleanup: remove candidate then position
    await prisma.candidate.deleteMany({ where: { positionId: posId } });
    await prisma.position.delete({ where: { id: posId } });
  });

  it('[TC-1.2-004] returns 404 for non-existent id', async () => {
    const res = await request(app)
      .delete('/positions/999999999')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
