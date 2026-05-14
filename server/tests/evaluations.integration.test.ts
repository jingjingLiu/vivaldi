import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { CandidateStatus, Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `eval_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

const app = createApp();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let coordCookie: string;
let interviewerCookie: string;
let unassignedInterviewerCookie: string;
let candidateCookie: string;

let positionId: number;
let candidateAId: number; // has submitted OA
let candidateBId: number; // has OaSubmission but submittedAt = null

let interviewerUserId: number;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function candidateLogin(code: string, phoneLast4: string): Promise<string> {
  const res = await request(app)
    .post('/auth/candidate-login')
    .send({ oneTimeCode: code, phoneLast4 });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create coordinator
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: `Coordinator Eval ${SUFFIX}`,
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Create assigned interviewer
  const interviewer = await prisma.user.create({
    data: {
      username: `iview_${SUFFIX}`,
      passwordHash: await hashPassword('Interviewer1!'),
      name: `Interviewer Eval ${SUFFIX}`,
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewerUserId = interviewer.id;

  // Create unassigned interviewer
  await prisma.user.create({
    data: {
      username: `iview2_${SUFFIX}`,
      passwordHash: await hashPassword('Interviewer2!'),
      name: `Unassigned Interviewer ${SUFFIX}`,
      roles: { create: [{ role: Role.interviewer }] },
    },
  });

  // Login all users
  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  interviewerCookie = await loginAs(`iview_${SUFFIX}`, 'Interviewer1!');
  unassignedInterviewerCookie = await loginAs(`iview2_${SUFFIX}`, 'Interviewer2!');

  // Create position with OA form and 2 questions
  const pos = await prisma.position.create({ data: { name: `Pos Eval ${SUFFIX}` } });
  positionId = pos.id;

  await prisma.oaForm.create({
    data: {
      positionId,
      timeLimitMinutes: 90,
      questions: {
        create: [
          { sortOrder: 0, questionText: 'Explain closures', answerType: 'text' },
          { sortOrder: 1, questionText: 'Write a binary search', answerType: 'code' },
        ],
      },
    },
  });

  // Assign interviewer to position
  await prisma.positionInterviewer.create({
    data: { positionId, userId: interviewerUserId },
  });

  // Create candidate A in date_confirmed with submitted OA
  const oaFormWithQuestions = await prisma.oaForm.findUnique({
    where: { positionId },
    include: { questions: true },
  });
  const questions = oaFormWithQuestions!.questions;

  const candA = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: `EVA1${SUFFIX}`.slice(0, 10),
      phone: '13800001111',
      status: CandidateStatus.date_confirmed,
    },
  });
  candidateAId = candA.id;

  // Create a submitted OA submission with answers for candidate A
  const submissionA = await prisma.oaSubmission.create({
    data: {
      candidateId: candidateAId,
      startedAt: new Date(Date.now() - 3600000),
      submittedAt: new Date(),
      autoSubmitted: false,
    },
  });

  await prisma.oaAnswer.createMany({
    data: questions.map((q) => ({
      submissionId: submissionA.id,
      questionId: q.id,
      answerContent: `Answer for ${q.questionText}`,
    })),
  });

  // Create candidate B with OaSubmission but submittedAt = null
  const candB = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: `EVB2${SUFFIX}`.slice(0, 10),
      phone: '13800002222',
      status: CandidateStatus.date_confirmed,
    },
  });
  candidateBId = candB.id;

  await prisma.oaSubmission.create({
    data: {
      candidateId: candidateBId,
      startedAt: new Date(),
      submittedAt: null,
      autoSubmitted: false,
    },
  });

  // Create candidate user for "candidate kind" test (using candidate A's OTC)
  candidateCookie = await candidateLogin(`EVA1${SUFFIX}`.slice(0, 10), '1111');
});

afterAll(async () => {
  // Delete evaluations
  await prisma.evaluation.deleteMany({
    where: { candidateId: { in: [candidateAId, candidateBId] } },
  });

  // Delete OA answers and submissions
  const subA = await prisma.oaSubmission.findUnique({ where: { candidateId: candidateAId } });
  if (subA) {
    await prisma.oaAnswer.deleteMany({ where: { submissionId: subA.id } });
    await prisma.oaSubmission.delete({ where: { id: subA.id } });
  }
  const subB = await prisma.oaSubmission.findUnique({ where: { candidateId: candidateBId } });
  if (subB) {
    await prisma.oaSubmission.delete({ where: { id: subB.id } });
  }

  // Delete candidates
  await prisma.candidate.deleteMany({ where: { id: { in: [candidateAId, candidateBId] } } });

  // Delete OA form (cascades to questions)
  await prisma.oaForm.deleteMany({ where: { positionId } });

  // Delete position interviewers
  await prisma.positionInterviewer.deleteMany({ where: { positionId } });

  // Delete position
  await prisma.position.deleteMany({ where: { id: positionId } });

  // Delete users
  await prisma.user.deleteMany({
    where: { username: { in: [`coord_${SUFFIX}`, `iview_${SUFFIX}`, `iview2_${SUFFIX}`] } },
  });

  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/evaluations', () => {
  it('[TC-6.1-001] 1. assigned interviewer can submit evaluation → 201 and advances final status', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [interviewerCookie])
      .send({ result: 'passed', comment: 'Great performance' });

    expect(res.status).toBe(201);
    expect(res.body.evaluation).toBeDefined();
    expect(res.body.evaluation.result).toBe('passed');
    expect(res.body.evaluation.comment).toBe('Great performance');

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateAId } });
    expect(candidate?.status).toBe(CandidateStatus.passed);

    const history = await prisma.statusHistory.findMany({
      where: { candidateId: candidateAId },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map(h => h.toStatus)).toEqual([
      CandidateStatus.human_completed,
      CandidateStatus.passed,
    ]);
  });

  it('[TC-6.1-005] 2. terminal candidate cannot receive another interview evaluation', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [interviewerCookie])
      .send({ result: 'failed', comment: 'On reflection, did not meet bar' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');

    // Verify the final-state guard preserves the original evaluation only.
    const rows = await prisma.evaluation.findMany({
      where: { candidateId: candidateAId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].result).toBe('passed');
    expect(rows[0].comment).toBe('Great performance');
  });

  it('[TC-6.1-007] 3. POST for candidate with unsubmitted OA → 400 OA_NOT_SUBMITTED', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateBId}/evaluations`)
      .set('Cookie', [interviewerCookie])
      .send({ result: 'passed' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OA_NOT_SUBMITTED');
  });

  it('[TC-6.1-008] 4. unassigned interviewer → 403 NOT_ASSIGNED', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [unassignedInterviewerCookie])
      .send({ result: 'passed' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ASSIGNED');
  });

  it('5. coordinator (wrong role) → 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [coordCookie])
      .send({ result: 'passed' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('6. candidate kind → 403', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [candidateCookie])
      .send({ result: 'passed' });

    expect(res.status).toBe(403);
  });

  it('7. invalid body (missing result) → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [interviewerCookie])
      .send({ comment: 'No result field' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('8. non-existent candidateId → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .post('/candidates/999999999/evaluations')
      .set('Cookie', [interviewerCookie])
      .send({ result: 'passed' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('GET /candidates/:id/evaluations', () => {
  it('[TC-6.2-001] 9. coordinator can list evaluations → includes interviewer {id, name}, sorted desc', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateAId}/evaluations`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.evaluations)).toBe(true);
    expect(res.body.evaluations.length).toBeGreaterThan(0);

    const ev = res.body.evaluations[0] as {
      id: number;
      result: string;
      comment: string | null;
      createdAt: string;
      interviewer: { id: number; name: string };
    };
    expect(ev.interviewer).toBeDefined();
    expect(typeof ev.interviewer.id).toBe('number');
    expect(typeof ev.interviewer.name).toBe('string');
    expect(ev.result).toBe('passed');
  });
});

describe('GET /candidates/:id/oa-answers', () => {
  it('10. interviewer can get OA answers → submission meta + answers with question metadata + timeLimitMinutes', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateAId}/oa-answers`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    const { submission, answers, timeLimitMinutes } = res.body as {
      submission: { startedAt: string; submittedAt: string; autoSubmitted: boolean };
      answers: Array<{
        questionId: number;
        sortOrder: number;
        questionText: string;
        answerType: string;
        answerContent: string | null;
      }>;
      timeLimitMinutes: number;
    };

    expect(submission).toBeDefined();
    expect(submission.submittedAt).toBeTruthy();
    expect(typeof submission.autoSubmitted).toBe('boolean');

    expect(Array.isArray(answers)).toBe(true);
    expect(answers.length).toBe(2);
    for (const ans of answers) {
      expect(typeof ans.questionId).toBe('number');
      expect(typeof ans.sortOrder).toBe('number');
      expect(typeof ans.questionText).toBe('string');
      expect(typeof ans.answerType).toBe('string');
    }

    expect(timeLimitMinutes).toBe(90);
  });

  it('11. candidate with unsubmitted OA → 404 NO_OA_SUBMISSION', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateBId}/oa-answers`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_OA_SUBMISSION');
  });
});
