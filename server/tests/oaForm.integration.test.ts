import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `oa_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

let coordCookie: string;
let interviewerCookie: string;
let screenerCookie: string;
let positionId: number;

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

function oa(posId: number = positionId) {
  return `/positions/${posId}/oa-form`;
}

const THREE_QUESTIONS = [
  { questionText: 'What is polymorphism?', answerType: 'text', sortOrder: 0 },
  { questionText: 'Write a binary search function', answerType: 'code', sortOrder: 1 },
  { questionText: 'Explain SOLID principles', answerType: 'text', sortOrder: 2 },
];

// -----------------------------------------------------------------------
// Setup / Teardown
// -----------------------------------------------------------------------

beforeAll(async () => {
  // Coordinator
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Coord OA Tests',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Interviewer
  await prisma.user.create({
    data: {
      username: `interviewer_${SUFFIX}`,
      passwordHash: await hashPassword('Interview1!'),
      name: 'Interviewer OA Tests',
      roles: { create: [{ role: Role.interviewer }] },
    },
  });

  // Screener (no coordinator/interviewer role)
  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Screener OA Tests',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  interviewerCookie = await loginAs(`interviewer_${SUFFIX}`, 'Interview1!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');

  // Create a test position
  const pos = await prisma.position.create({ data: { name: `pos_oa_${SUFFIX}` } });
  positionId = pos.id;
});

afterAll(async () => {
  // Remove OA submissions, answers, candidates, form, position, users
  const candidates = await prisma.candidate.findMany({ where: { positionId } });
  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length > 0) {
    const submissions = await prisma.oaSubmission.findMany({
      where: { candidateId: { in: candidateIds } },
    });
    const submissionIds = submissions.map((s) => s.id);
    if (submissionIds.length > 0) {
      await prisma.oaAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.oaSubmission.deleteMany({ where: { id: { in: submissionIds } } });
    }
    await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
  }
  await prisma.oaForm.deleteMany({ where: { positionId } });
  await prisma.position.deleteMany({ where: { id: positionId } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `interviewer_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await disconnectPrisma();
});

// -----------------------------------------------------------------------
// Auth / role enforcement
// -----------------------------------------------------------------------

describe('Auth enforcement on /positions/:positionId/oa-form', () => {
  it('GET returns 401 without auth cookie', async () => {
    const res = await request(app).get(oa());
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for screener (neither coordinator nor interviewer)', async () => {
    const res = await request(app).get(oa()).set('Cookie', [screenerCookie]);
    expect(res.status).toBe(403);
  });

  it('PUT returns 401 without auth cookie', async () => {
    const res = await request(app)
      .put(oa())
      .send({ timeLimitMinutes: 60, questions: THREE_QUESTIONS });
    expect(res.status).toBe(401);
  });

  it('PUT returns 403 for screener', async () => {
    const res = await request(app)
      .put(oa())
      .set('Cookie', [screenerCookie])
      .send({ timeLimitMinutes: 60, questions: THREE_QUESTIONS });
    expect(res.status).toBe(403);
  });

  it('DELETE returns 401 without auth cookie', async () => {
    const res = await request(app).delete(oa());
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// GET — non-existent form
// -----------------------------------------------------------------------

describe('GET — no form exists yet', () => {
  it('returns { form: null } when no form is defined for the position', async () => {
    const res = await request(app).get(oa()).set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ form: null });
  });

  it('returns 404 POSITION_NOT_FOUND for invalid positionId', async () => {
    const res = await request(app).get(oa(999999999)).set('Cookie', [coordCookie]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('POSITION_NOT_FOUND');
  });
});

// -----------------------------------------------------------------------
// PUT — validation errors
// -----------------------------------------------------------------------

describe('PUT — validation errors', () => {
  it('[TC-4.1-004] returns 400 VALIDATION_ERROR for empty questions array', async () => {
    const res = await request(app)
      .put(oa())
      .set('Cookie', [coordCookie])
      .send({ timeLimitMinutes: 60, questions: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-4.1-003] returns 400 DUPLICATE_SORT_ORDER when sortOrders repeat', async () => {
    const res = await request(app)
      .put(oa())
      .set('Cookie', [coordCookie])
      .send({
        timeLimitMinutes: 60,
        questions: [
          { questionText: 'Q1', answerType: 'text', sortOrder: 0 },
          { questionText: 'Q2', answerType: 'code', sortOrder: 0 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DUPLICATE_SORT_ORDER');
  });

  it('returns 404 POSITION_NOT_FOUND for invalid positionId', async () => {
    const res = await request(app)
      .put(oa(999999999))
      .set('Cookie', [coordCookie])
      .send({ timeLimitMinutes: 60, questions: THREE_QUESTIONS });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('POSITION_NOT_FOUND');
  });

  it('[TC-4.1-006] returns 400 VALIDATION_ERROR for timeLimitMinutes out of range', async () => {
    const res = await request(app)
      .put(oa())
      .set('Cookie', [coordCookie])
      .send({ timeLimitMinutes: 0, questions: THREE_QUESTIONS });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// -----------------------------------------------------------------------
// PUT — creates a form
// -----------------------------------------------------------------------

describe('PUT — create form', () => {
  it('[TC-4.1-001] coordinator can create form with 3 questions, sorted by sortOrder', async () => {
    const body = {
      timeLimitMinutes: 90,
      instructionEn: 'Read instructions carefully.',
      instructionZh: '请仔细阅读说明。',
      questions: [
        { questionText: 'Q-sort2', answerType: 'code', sortOrder: 2 },
        { questionText: 'Q-sort0', answerType: 'text', sortOrder: 0 },
        { questionText: 'Q-sort1', answerType: 'text', sortOrder: 1 },
      ],
    };

    const res = await request(app).put(oa()).set('Cookie', [coordCookie]).send(body);
    expect(res.status).toBe(200);

    const { form } = res.body as { form: Record<string, unknown> };
    expect(form.positionId).toBe(positionId);
    expect(form.timeLimitMinutes).toBe(90);
    expect(form.instructionEn).toBe('Read instructions carefully.');
    expect(form.instructionZh).toBe('请仔细阅读说明。');
    expect(form).toHaveProperty('id');
    expect(form).toHaveProperty('createdAt');
    expect(form).toHaveProperty('updatedAt');

    const questions = form.questions as { sortOrder: number; questionText: string; answerType: string }[];
    expect(questions.length).toBe(3);
    // Must be sorted ascending
    expect(questions[0].sortOrder).toBe(0);
    expect(questions[0].questionText).toBe('Q-sort0');
    expect(questions[1].sortOrder).toBe(1);
    expect(questions[2].sortOrder).toBe(2);
    expect(questions[2].answerType).toBe('code');
  });

  it('interviewer can also access the OA form endpoint', async () => {
    const res = await request(app).get(oa()).set('Cookie', [interviewerCookie]);
    expect(res.status).toBe(200);
    expect(res.body.form).not.toBeNull();
  });
});

// -----------------------------------------------------------------------
// GET — after PUT
// -----------------------------------------------------------------------

describe('GET — after PUT returns the form', () => {
  it('GET returns the newly created form', async () => {
    const res = await request(app).get(oa()).set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    const { form } = res.body as { form: Record<string, unknown> };
    expect(form).not.toBeNull();
    expect(form.positionId).toBe(positionId);
    expect(form.timeLimitMinutes).toBe(90);
    const questions = form.questions as unknown[];
    expect(questions.length).toBe(3);
  });
});

// -----------------------------------------------------------------------
// PUT — full replace
// -----------------------------------------------------------------------

describe('PUT — full replace of existing form', () => {
  it('[TC-4.1-002] replaces the form with new timeLimitMinutes and fewer questions; old questions are gone', async () => {
    const res = await request(app)
      .put(oa())
      .set('Cookie', [coordCookie])
      .send({
        timeLimitMinutes: 45,
        questions: [
          { questionText: 'Only question', answerType: 'text', sortOrder: 0 },
        ],
      });

    expect(res.status).toBe(200);
    const { form } = res.body as { form: Record<string, unknown> };
    expect(form.timeLimitMinutes).toBe(45);
    const questions = form.questions as unknown[];
    expect(questions.length).toBe(1);
    // Previous 3 questions should be gone
  });

  it('GET after replace returns only 1 question', async () => {
    const res = await request(app).get(oa()).set('Cookie', [coordCookie]);
    const { form } = res.body as { form: { questions: unknown[] } };
    expect(form.questions.length).toBe(1);
  });
});

// -----------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------

describe('DELETE — success', () => {
  it('[TC-4.1-005] deletes the form; subsequent GET returns null', async () => {
    const delRes = await request(app).delete(oa()).set('Cookie', [coordCookie]);
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const getRes = await request(app).get(oa()).set('Cookie', [coordCookie]);
    expect(getRes.status).toBe(200);
    expect(getRes.body.form).toBeNull();
  });
});

// -----------------------------------------------------------------------
// DELETE — FORM_IN_USE
// -----------------------------------------------------------------------

describe('DELETE — blocked by OaSubmission', () => {
  let blockPosId: number;

  beforeAll(async () => {
    // Create a separate position for this test
    const pos = await prisma.position.create({ data: { name: `pos_oa_block_${SUFFIX}` } });
    blockPosId = pos.id;

    // Create the OA form for this position
    await request(app)
      .put(oa(blockPosId))
      .set('Cookie', [coordCookie])
      .send({
        timeLimitMinutes: 30,
        questions: [{ questionText: 'Blocked Q', answerType: 'text', sortOrder: 0 }],
      });

    // Create a candidate with an OaSubmission
    const candidate = await prisma.candidate.create({
      data: {
        positionId: blockPosId,
        oneTimeCode: `BLK${SUFFIX.slice(-6)}`,
      },
    });

    await prisma.oaSubmission.create({
      data: { candidateId: candidate.id },
    });
  });

  afterAll(async () => {
    // Cleanup the blocking position and related records
    const candidates = await prisma.candidate.findMany({ where: { positionId: blockPosId } });
    const candidateIds = candidates.map((c) => c.id);
    if (candidateIds.length > 0) {
      const submissions = await prisma.oaSubmission.findMany({
        where: { candidateId: { in: candidateIds } },
      });
      const submissionIds = submissions.map((s) => s.id);
      if (submissionIds.length > 0) {
        await prisma.oaAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await prisma.oaSubmission.deleteMany({ where: { id: { in: submissionIds } } });
      }
      await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    }
    await prisma.oaForm.deleteMany({ where: { positionId: blockPosId } });
    await prisma.position.delete({ where: { id: blockPosId } });
  });

  it('returns 409 FORM_IN_USE when candidates have OaSubmissions', async () => {
    const res = await request(app).delete(oa(blockPosId)).set('Cookie', [coordCookie]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FORM_IN_USE');
  });
});
