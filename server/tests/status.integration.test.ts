import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Role, CandidateStatus } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `status_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

let coordCookie: string;
let screenerCookie: string;
let interviewerCookie: string;

let coordUserId: number;

let testPositionId: number;

// Track candidates for cleanup
const createdCandidateIds: number[] = [];

const app = createApp();

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

let codeCounter = 0;

async function createCandidate(status: CandidateStatus = CandidateStatus.new): Promise<number> {
  // Build a deterministic but unique code per test run using suffix + counter
  codeCounter++;
  const base = SUFFIX.replace('status_', 'S').slice(0, 5);
  const counter = String(codeCounter).padStart(3, '0');
  const code = `${base}${counter}`.toUpperCase().slice(0, 8);
  const c = await prisma.candidate.create({
    data: {
      positionId: testPositionId,
      status,
      oneTimeCode: code,
    },
  });
  createdCandidateIds.push(c.id);
  return c.id;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Ensure oa_deadline_days setting exists (use seeded default of 7; do not overwrite)
  await prisma.systemSetting.upsert({
    where: { key: 'oa_deadline_days' },
    update: {},
    create: { key: 'oa_deadline_days', value: '7' },
  });

  const coord = await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Status Coordinator',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });
  coordUserId = coord.id;

  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Status Screener',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  await prisma.user.create({
    data: {
      username: `interviewer_${SUFFIX}`,
      passwordHash: await hashPassword('Interviewer1!'),
      name: 'Status Interviewer',
      roles: { create: [{ role: Role.interviewer }] },
    },
  });

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');
  interviewerCookie = await loginAs(`interviewer_${SUFFIX}`, 'Interviewer1!');

  const pos = await prisma.position.create({ data: { name: `Status Test Position ${SUFFIX}` } });
  testPositionId = pos.id;
});

afterAll(async () => {
  if (createdCandidateIds.length > 0) {
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  await prisma.position.deleteMany({ where: { id: testPositionId } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `interviewer_${SUFFIX}` } } });

  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// POST /candidates/:id/status — Happy path: new → waiting_for_oa
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — new → waiting_for_oa', () => {
  it('[TC-3.4-001] sets oa_deadline based on system setting oaDeadlineDays and appends StatusHistory', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    // Read actual configured oa_deadline_days before the transition
    const settingRow = await prisma.systemSetting.findUnique({ where: { key: 'oa_deadline_days' } });
    const configuredDays = settingRow ? (parseInt(settingRow.value, 10) || 7) : 7;

    const before = Date.now();

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa', note: 'Sending OA now' });

    expect(res.status).toBe(200);
    const { candidate } = res.body as { candidate: Record<string, unknown> };
    expect(candidate.status).toBe('waiting_for_oa');

    // oaDeadline should be set to approximately now + configuredDays
    expect(candidate.oaDeadline).not.toBeNull();
    const deadline = new Date(candidate.oaDeadline as string).getTime();
    const expectedMin = before + (configuredDays - 1) * 24 * 60 * 60 * 1000; // at least N-1 days
    const expectedMax = before + (configuredDays + 1) * 24 * 60 * 60 * 1000; // at most N+1 days
    expect(deadline).toBeGreaterThanOrEqual(expectedMin);
    expect(deadline).toBeLessThanOrEqual(expectedMax);

    // statusHistory should have an entry
    expect(Array.isArray(candidate.statusHistory)).toBe(true);
    const history = candidate.statusHistory as Array<Record<string, unknown>>;
    expect(history.length).toBeGreaterThanOrEqual(1);
    const entry = history[0];
    expect(entry.fromStatus).toBe('new');
    expect(entry.toStatus).toBe('waiting_for_oa');
    expect(entry.note).toBe('Sending OA now');
  });

  it('[TC-3.4-001] StatusHistory row has correct operatorId', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    const rows = await prisma.statusHistory.findMany({ where: { candidateId } });
    expect(rows.length).toBe(1);
    expect(rows[0].fromStatus).toBe(CandidateStatus.new);
    expect(rows[0].toStatus).toBe(CandidateStatus.waiting_for_oa);
    expect(rows[0].operatorId).toBe(coordUserId);
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — invalid transition', () => {
  it('[TC-3.4-006] returns 400 INVALID_TRANSITION with from/to details for new → passed', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'passed' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(res.body.details).toMatchObject({ from: 'new', to: 'passed' });
  });

  it('[TC-3.4-006] returns 400 INVALID_TRANSITION for waiting_for_oa → date_confirmed', async () => {
    const candidateId = await createCandidate(CandidateStatus.waiting_for_oa);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'date_confirmed' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(res.body.details).toMatchObject({ from: 'waiting_for_oa', to: 'date_confirmed' });
  });
});

// ---------------------------------------------------------------------------
// Terminal status guard
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — terminal status', () => {
  it('[TC-3.4-005] returns 400 TERMINAL_STATUS when trying to transition from a terminal state', async () => {
    const candidateId = await createCandidate(CandidateStatus.passed);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMINAL_STATUS');
  });

  it('[TC-3.4-005] returns 400 TERMINAL_STATUS for oa_failed terminal state', async () => {
    const candidateId = await createCandidate(CandidateStatus.oa_failed);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMINAL_STATUS');
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — authorization', () => {
  it('[TC-3.4-010] lets screener pass screening and send OA from new status', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [screenerCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('waiting_for_oa');
  });

  it('[TC-3.4-010] lets screener reject during screening from new status', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [screenerCookie])
      .send({ toStatus: 'rejected' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('rejected');
  });

  it('[TC-3.4-010] returns 403 FORBIDDEN when screener tries to change post-screening status', async () => {
    const candidateId = await createCandidate(CandidateStatus.waiting_for_oa);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [screenerCookie])
      .send({ toStatus: 'oa_completed' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when interviewer tries to change status', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [interviewerCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 without cookie', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 404 for non-existent candidate
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — 404', () => {
  it('returns 404 NOT_FOUND for non-existent candidate', async () => {
    const res = await request(app)
      .post('/candidates/999999999/status')
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /candidates/:id/status-history
// ---------------------------------------------------------------------------

describe('GET /candidates/:id/status-history', () => {
  it('[TC-3.5-001] returns history in descending order with operatorName populated', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    // Transition 1: new → waiting_for_oa
    await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa', note: 'First transition' });

    // Seed oa_completed directly (OA submission is Plan #10)
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { status: CandidateStatus.oa_completed },
    });
    await prisma.statusHistory.create({
      data: {
        candidateId,
        fromStatus: CandidateStatus.waiting_for_oa,
        toStatus: CandidateStatus.oa_completed,
        operatorId: null,
        note: 'Seeded for test',
      },
    });

    // Transition 2: oa_completed → wait_to_confirm_date
    await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'wait_to_confirm_date', note: 'OA passed' });

    const res = await request(app)
      .get(`/candidates/${candidateId}/status-history`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { history } = res.body as { history: Array<Record<string, unknown>> };

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Verify descending order: newest first
    for (let i = 0; i < history.length - 1; i++) {
      const curr = new Date(history[i].createdAt as string).getTime();
      const next = new Date(history[i + 1].createdAt as string).getTime();
      expect(curr).toBeGreaterThanOrEqual(next);
    }

    // Most recent entry should be oa_completed → wait_to_confirm_date
    const newest = history[0];
    expect(newest.fromStatus).toBe('oa_completed');
    expect(newest.toStatus).toBe('wait_to_confirm_date');
    expect(newest.note).toBe('OA passed');
    // operatorName should be populated for coordinator-driven transition
    expect(newest.operatorName).toBe('Status Coordinator');
  });

  it('screener can access status-history', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);
    const res = await request(app)
      .get(`/candidates/${candidateId}/status-history`)
      .set('Cookie', [screenerCookie]);
    expect(res.status).toBe(200);
  });

  it('interviewer can access status-history', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);
    const res = await request(app)
      .get(`/candidates/${candidateId}/status-history`)
      .set('Cookie', [interviewerCookie]);
    expect(res.status).toBe(200);
  });

  it('returns 401 without cookie', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);
    const res = await request(app).get(`/candidates/${candidateId}/status-history`);
    expect(res.status).toBe(401);
  });

  it('returns 404 NOT_FOUND for non-existent candidate', async () => {
    const res = await request(app)
      .get('/candidates/999999999/status-history')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Full happy-path chain: at least 5 distinct valid transitions
// ---------------------------------------------------------------------------

describe('Full happy-path chain — 5+ distinct transitions', () => {
  it('[TC-3.4-003] covers: new→waiting_for_oa, oa_completed→wait_to_confirm_date, wait_to_confirm_date→give_up_for_human', async () => {
    // Transition 1: new → waiting_for_oa (via endpoint)
    const candidateId = await createCandidate(CandidateStatus.new);
    let res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('waiting_for_oa');

    // Seed oa_completed (Plan #10 adds real flow)
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: CandidateStatus.oa_completed } });

    // Transition 2: oa_completed → wait_to_confirm_date (via endpoint)
    res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'wait_to_confirm_date' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('wait_to_confirm_date');

    // Transition 3: wait_to_confirm_date → give_up_for_human (via endpoint)
    res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'give_up_for_human', note: 'No response from candidate' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('give_up_for_human');

    // Now it's terminal — next attempt should fail
    res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'date_confirmed' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMINAL_STATUS');
  });

  it('[TC-3.4-003] covers: oa_completed→oa_failed, date_confirmed→human_completed, human_completed→passed', async () => {
    // Seed oa_completed
    const candidateId = await createCandidate(CandidateStatus.oa_completed);

    // Transition 4: oa_completed → oa_failed (via endpoint)
    let res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'oa_failed' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('oa_failed');
  });

  it('[TC-3.4-003] covers: date_confirmed→human_completed→passed', async () => {
    const candidateId = await createCandidate(CandidateStatus.date_confirmed);

    // Transition 5: date_confirmed → human_completed
    let res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'human_completed' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('human_completed');

    // Transition 6: human_completed → passed
    res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'passed' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('passed');
  });

  it('[TC-3.4-003] covers: date_confirmed→give_up_for_human, human_completed→rejected', async () => {
    // Transition: date_confirmed → give_up_for_human
    const candidateId1 = await createCandidate(CandidateStatus.date_confirmed);
    let res = await request(app)
      .post(`/candidates/${candidateId1}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'give_up_for_human' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('give_up_for_human');

    // Transition: human_completed → rejected
    const candidateId2 = await createCandidate(CandidateStatus.human_completed);
    res = await request(app)
      .post(`/candidates/${candidateId2}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'rejected' });
    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('POST /candidates/:id/status — validation', () => {
  it('[TC-3.4-006] returns 400 VALIDATION_ERROR for invalid toStatus value', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'not_a_real_status' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-3.4-008] returns 400 VALIDATION_ERROR for note exceeding 1000 chars', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa', note: 'a'.repeat(1001) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-3.4-008] accepts note exactly 1000 chars', async () => {
    const candidateId = await createCandidate(CandidateStatus.new);

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa', note: 'a'.repeat(1000) });

    expect(res.status).toBe(200);
  });
});
