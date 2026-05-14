import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { CandidateStatus, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const U = `routes_${Date.now()}`;
let positionId: number;
let candidateId: number;
let candidateCode: string;
const COOKIE_NAME = 'vivaldi_session';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      username: U,
      passwordHash: await hashPassword('pass12345'),
      name: 'Route Tester',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });
  const pos = await prisma.position.create({ data: { name: `RouteTest-${Date.now()}` } });
  positionId = pos.id;
  candidateCode = `RT${Date.now()}`.slice(0, 10);
  const cand = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: candidateCode,
      phone: '13711119999',
      status: CandidateStatus.waiting_for_oa,
    },
  });
  candidateId = cand.id;
});

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { id: candidateId } });
  await prisma.position.deleteMany({ where: { id: positionId } });
  await prisma.user.deleteMany({ where: { username: U } });
  await disconnectPrisma();
});

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c) => c.startsWith(`${COOKIE_NAME}=`));
}

describe('POST /auth/login (internal)', () => {
  it('[TC-2.1-001] returns 200 and sets httpOnly cookie on success', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/login').send({ username: U, password: 'pass12345' });
    expect(res.status).toBe(200);
    expect(res.body.user.kind).toBe('internal');
    expect(res.body.user.roles).toContain('coordinator');
    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie!.toLowerCase()).toContain('httponly');
  });

  it('[TC-2.1-004] returns 401 on bad credentials', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/login').send({ username: U, password: 'WRONG' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('[TC-2.1-007] returns 400 on missing fields', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/candidate-login', () => {
  it('[TC-2.2-001] returns 200 for valid code + phone last-4', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/auth/candidate-login')
      .send({ oneTimeCode: candidateCode, phoneLast4: '9999' });
    expect(res.status).toBe(200);
    expect(res.body.user.kind).toBe('candidate');
  });

  it('[TC-2.2-004] returns 401 for wrong phone', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/auth/candidate-login')
      .send({ oneTimeCode: candidateCode, phoneLast4: '0000' });
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('[TC-2.1-001] returns the current user when cookie is present', async () => {
    const app = createApp();
    const login = await request(app).post('/auth/login').send({ username: U, password: 'pass12345' });
    const cookie = extractCookie(login)!;

    const me = await request(app).get('/auth/me').set('Cookie', [cookie]);
    expect(me.status).toBe(200);
    expect(me.body.user.kind).toBe('internal');
  });

  it('[TC-2.3-004] returns 401 without cookie', async () => {
    const app = createApp();
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('[TC-2.3-001] clears the cookie', async () => {
    const app = createApp();
    const login = await request(app).post('/auth/login').send({ username: U, password: 'pass12345' });
    const cookie = extractCookie(login)!;

    const out = await request(app).post('/auth/logout').set('Cookie', [cookie]);
    expect(out.status).toBe(200);
    const cleared = extractCookie(out);
    expect(cleared).toBeDefined();
    expect(cleared!.toLowerCase()).toMatch(/max-age=0|expires=/);
  });
});
