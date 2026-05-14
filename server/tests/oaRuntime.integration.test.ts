import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { CandidateStatus, Role, UserNotificationEvent } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `oart_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

const app = createApp();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let candidateCookie: string;
let coordCookie: string;
let coordId: number;

let positionId: number;
let candidateId: number;
let candidateCode: string;
let candidatePhone: string;

// A second position/candidate for the wrong-state test
let newStatusPositionId: number;
let newStatusCandidateId: number;
let newStatusCandidateCode: string;
let newStatusCandidatePhone: string;
let newStatusCandidateCookie: string;

// A third position WITHOUT an OA form for the NO_OA_FORM test
let noFormPositionId: number;
let noFormCandidateId: number;
let noFormCandidateCode: string;
let noFormCandidatePhone: string;
let noFormCandidateCookie: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
}

async function loginAsInternal(username: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

async function candidateLogin(code: string, phoneLast4: string): Promise<string> {
  const res = await request(app)
    .post('/auth/candidate-login')
    .send({ oneTimeCode: code, phoneLast4 });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

const THREE_QUESTIONS = [
  { questionText: 'Explain OOP', answerType: 'text', sortOrder: 0 },
  { questionText: 'Write quicksort in TypeScript', answerType: 'code', sortOrder: 1 },
  { questionText: 'Describe REST principles', answerType: 'text', sortOrder: 2 },
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create coordinator user
  const coord = await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: `Coord OA Runtime ${SUFFIX}`,
      roles: { create: [{ role: Role.coordinator }] },
    },
  });
  coordId = coord.id;
  coordCookie = await loginAsInternal(`coord_${SUFFIX}`, 'Admin1234!');

  // Position with OA form
  const pos = await prisma.position.create({ data: { name: `pos_${SUFFIX}` } });
  positionId = pos.id;

  // Create the OA form via the API
  const formRes = await request(app)
    .put(`/positions/${positionId}/oa-form`)
    .set('Cookie', [coordCookie])
    .send({ timeLimitMinutes: 60, instructionEn: 'Do your best.', instructionZh: '尽力而为。', questions: THREE_QUESTIONS });
  expect(formRes.status).toBe(200);

  // Create candidate in waiting_for_oa state
  candidatePhone = '13900001111';
  candidateCode = `OAR${SUFFIX}`.slice(0, 10);
  const cand = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: candidateCode,
      phone: candidatePhone,
      status: CandidateStatus.waiting_for_oa,
    },
  });
  candidateId = cand.id;
  candidateCookie = await candidateLogin(candidateCode, '1111');

  // Second candidate with status 'new' for wrong-state test
  const newPos = await prisma.position.create({ data: { name: `pos_new_${SUFFIX}` } });
  newStatusPositionId = newPos.id;
  await request(app)
    .put(`/positions/${newStatusPositionId}/oa-form`)
    .set('Cookie', [coordCookie])
    .send({ timeLimitMinutes: 30, questions: [{ questionText: 'Q1', answerType: 'text', sortOrder: 0 }] });

  newStatusCandidatePhone = '13900002222';
  newStatusCandidateCode = `OAN${SUFFIX}`.slice(0, 10);
  const newCand = await prisma.candidate.create({
    data: {
      positionId: newStatusPositionId,
      oneTimeCode: newStatusCandidateCode,
      phone: newStatusCandidatePhone,
      status: CandidateStatus.new,
    },
  });
  newStatusCandidateId = newCand.id;
  newStatusCandidateCookie = await candidateLogin(newStatusCandidateCode, '2222');

  // Third: position with no OA form
  const noFormPos = await prisma.position.create({ data: { name: `pos_noform_${SUFFIX}` } });
  noFormPositionId = noFormPos.id;
  noFormCandidatePhone = '13900003333';
  noFormCandidateCode = `OAF${SUFFIX}`.slice(0, 10);
  const noFormCand = await prisma.candidate.create({
    data: {
      positionId: noFormPositionId,
      oneTimeCode: noFormCandidateCode,
      phone: noFormCandidatePhone,
      status: CandidateStatus.waiting_for_oa,
    },
  });
  noFormCandidateId = noFormCand.id;
  noFormCandidateCookie = await candidateLogin(noFormCandidateCode, '3333');
});

afterAll(async () => {
  // Cleanup all test data
  for (const cid of [candidateId, newStatusCandidateId, noFormCandidateId]) {
    const sub = await prisma.oaSubmission.findUnique({ where: { candidateId: cid }, select: { id: true } });
    if (sub) {
      await prisma.oaAnswer.deleteMany({ where: { submissionId: sub.id } });
      await prisma.oaSubmission.delete({ where: { id: sub.id } });
    }
    await prisma.statusHistory.deleteMany({ where: { candidateId: cid } });
    await prisma.userNotification.deleteMany({ where: { candidateId: cid } });
    await prisma.candidate.deleteMany({ where: { id: cid } });
  }
  await prisma.oaForm.deleteMany({ where: { positionId: { in: [positionId, newStatusPositionId] } } });
  await prisma.position.deleteMany({ where: { id: { in: [positionId, newStatusPositionId, noFormPositionId] } } });
  await prisma.user.deleteMany({ where: { username: `coord_${SUFFIX}` } });
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Auth guard — internal user gets 403 FORBIDDEN
// ---------------------------------------------------------------------------

describe('requireCandidate guard', () => {
  it('rejects internal coordinator on GET /oa with 403 FORBIDDEN', async () => {
    const res = await request(app).get('/oa').set('Cookie', [coordCookie]);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/oa');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /oa — state check
// ---------------------------------------------------------------------------

describe('GET /oa before start', () => {
  it('[TC-4.3-001] returns state=not_started with instructions and questionCount=3', async () => {
    const res = await request(app).get('/oa').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('not_started');
    expect(res.body.timeLimitMinutes).toBe(60);
    expect(res.body.questionCount).toBe(3);
    expect(res.body.instructions.en).toBe('Do your best.');
    expect(res.body.instructions.zhCN).toBe('尽力而为。');
    expect(res.body.startedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /oa/start
// ---------------------------------------------------------------------------

describe('POST /oa/start', () => {
  it('[TC-4.3-002] sets startedAt and returns remainingSeconds', async () => {
    const res = await request(app).post('/oa/start').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(res.body.startedAt).toBeDefined();
    expect(typeof res.body.remainingSeconds).toBe('number');
    expect(res.body.remainingSeconds).toBeGreaterThan(0);
    expect(res.body.remainingSeconds).toBeLessThanOrEqual(60 * 60);
  });

  it('is idempotent — re-entering returns same startedAt', async () => {
    const first = await request(app).post('/oa/start').set('Cookie', [candidateCookie]);
    const second = await request(app).post('/oa/start').set('Cookie', [candidateCookie]);
    expect(second.status).toBe(200);
    expect(second.body.startedAt).toBe(first.body.startedAt);
  });

  it('GET /oa now returns state=in_progress', async () => {
    const res = await request(app).get('/oa').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('in_progress');
    expect(res.body.startedAt).toBeDefined();
    expect(typeof res.body.remainingSeconds).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// GET /oa/questions
// ---------------------------------------------------------------------------

let questionIds: number[] = [];

describe('GET /oa/questions', () => {
  it('[TC-4.3-003] returns 3 questions sorted by sortOrder, all answerContent null', async () => {
    const res = await request(app).get('/oa/questions').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBe(3);
    const qs = res.body.questions as Array<{ id: number; sortOrder: number; answerContent: unknown }>;
    expect(qs[0].sortOrder).toBe(0);
    expect(qs[1].sortOrder).toBe(1);
    expect(qs[2].sortOrder).toBe(2);
    for (const q of qs) {
      expect(q.answerContent).toBeNull();
    }
    questionIds = qs.map((q) => q.id);
  });
});

// ---------------------------------------------------------------------------
// PUT /oa/answers/:questionId
// ---------------------------------------------------------------------------

describe('PUT /oa/answers/:questionId', () => {
  it('[TC-4.3-003] saves an answer and returns ok=true + updatedAt', async () => {
    const res = await request(app)
      .put(`/oa/answers/${questionIds[0]}`)
      .set('Cookie', [candidateCookie])
      .send({ answerContent: 'OOP means encapsulation, inheritance, polymorphism.' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updatedAt).toBeDefined();
  });

  it('subsequent GET /oa/questions returns saved answerContent for that question', async () => {
    const res = await request(app).get('/oa/questions').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    const qs = res.body.questions as Array<{ id: number; answerContent: string | null }>;
    const q0 = qs.find((q) => q.id === questionIds[0]);
    expect(q0?.answerContent).toBe('OOP means encapsulation, inheritance, polymorphism.');
    const q1 = qs.find((q) => q.id === questionIds[1]);
    expect(q1?.answerContent).toBeNull();
  });

  it('can update (overwrite) a previously saved answer', async () => {
    const res = await request(app)
      .put(`/oa/answers/${questionIds[0]}`)
      .set('Cookie', [candidateCookie])
      .send({ answerContent: 'Updated: encapsulation, inheritance, and polymorphism.' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const qRes = await request(app).get('/oa/questions').set('Cookie', [candidateCookie]);
    const qs = qRes.body.questions as Array<{ id: number; answerContent: string | null }>;
    const q0 = qs.find((q) => q.id === questionIds[0]);
    expect(q0?.answerContent).toBe('Updated: encapsulation, inheritance, and polymorphism.');
  });
});

// ---------------------------------------------------------------------------
// POST /oa/submit
// ---------------------------------------------------------------------------

describe('POST /oa/submit', () => {
  it('[TC-4.3-004] submits the OA with autoSubmitted=false, transitions status to oa_completed', async () => {
    const res = await request(app).post('/oa/submit').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(res.body.autoSubmitted).toBe(false);
    expect(res.body.submittedAt).toBeDefined();

    // Verify DB status
    const cand = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(cand?.status).toBe(CandidateStatus.oa_completed);

    const notification = await prisma.userNotification.findFirst({
      where: {
        userId: coordId,
        candidateId,
        event: UserNotificationEvent.oa_completed,
      },
    });
    expect(notification?.title).toBe('候选人已完成 OA');
  });

  it('GET /oa after submit returns state=submitted', async () => {
    const res = await request(app).get('/oa').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('submitted');
  });

  it('[TC-4.3-013] re-submitting returns 409 ALREADY_SUBMITTED', async () => {
    const res = await request(app).post('/oa/submit').set('Cookie', [candidateCookie]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SUBMITTED');
  });
});

// ---------------------------------------------------------------------------
// Auto-submit flow: simulate expiry
// ---------------------------------------------------------------------------

describe('Auto-submit on expired timer', () => {
  let expiredCandidateId: number;
  let expiredCandidateCode: string;
  let expiredCandidateCookie: string;
  let expiredQuestionIds: number[] = [];

  beforeAll(async () => {
    // Create another candidate on the same position (which has the OA form)
    expiredCandidateCode = `OAX${SUFFIX}`.slice(0, 10);
    const phone = '13900009999';
    const cand = await prisma.candidate.create({
      data: {
        positionId,
        oneTimeCode: expiredCandidateCode,
        phone,
        status: CandidateStatus.waiting_for_oa,
      },
    });
    expiredCandidateId = cand.id;
    expiredCandidateCookie = await candidateLogin(expiredCandidateCode, '9999');

    // Start the OA
    const startRes = await request(app).post('/oa/start').set('Cookie', [expiredCandidateCookie]);
    expect(startRes.status).toBe(200);

    // Get questions to capture IDs
    const qRes = await request(app).get('/oa/questions').set('Cookie', [expiredCandidateCookie]);
    expiredQuestionIds = (qRes.body.questions as Array<{ id: number }>).map((q) => q.id);

    // Simulate expiry by back-dating startedAt
    await prisma.oaSubmission.update({
      where: { candidateId: expiredCandidateId },
      data: { startedAt: new Date(Date.now() - 61 * 60 * 1000) }, // 61 minutes ago (limit=60)
    });
  });

  afterAll(async () => {
    const sub = await prisma.oaSubmission.findUnique({
      where: { candidateId: expiredCandidateId },
      select: { id: true },
    });
    if (sub) {
      await prisma.oaAnswer.deleteMany({ where: { submissionId: sub.id } });
      await prisma.oaSubmission.delete({ where: { id: sub.id } });
    }
    await prisma.statusHistory.deleteMany({ where: { candidateId: expiredCandidateId } });
    await prisma.userNotification.deleteMany({ where: { candidateId: expiredCandidateId } });
    await prisma.candidate.delete({ where: { id: expiredCandidateId } });
  });

  it('PUT /oa/answers returns 410 TIME_EXPIRED and auto-submits', async () => {
    const res = await request(app)
      .put(`/oa/answers/${expiredQuestionIds[0]}`)
      .set('Cookie', [expiredCandidateCookie])
      .send({ answerContent: 'answer after expiry' });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('TIME_EXPIRED');

    // Verify DB: submission autoSubmitted=true, submittedAt set
    const sub = await prisma.oaSubmission.findUnique({ where: { candidateId: expiredCandidateId } });
    expect(sub?.autoSubmitted).toBe(true);
    expect(sub?.submittedAt).not.toBeNull();

    // Verify candidate status = oa_completed
    const cand = await prisma.candidate.findUnique({ where: { id: expiredCandidateId } });
    expect(cand?.status).toBe(CandidateStatus.oa_completed);
  });
});

// ---------------------------------------------------------------------------
// Wrong state — candidate with status 'new'
// ---------------------------------------------------------------------------

describe('Candidate with wrong state (status=new)', () => {
  it('[TC-4.2-005] POST /oa/start returns 403 WRONG_STATE', async () => {
    const res = await request(app).post('/oa/start').set('Cookie', [newStatusCandidateCookie]);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_STATE');
  });
});

// ---------------------------------------------------------------------------
// No OA form for position
// ---------------------------------------------------------------------------

describe('No OA form exists for position', () => {
  it('[TC-4.2-004] GET /oa returns 400 NO_OA_FORM', async () => {
    const res = await request(app).get('/oa').set('Cookie', [noFormCandidateCookie]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_OA_FORM');
  });
});
