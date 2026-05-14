import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

// ---------------------------------------------------------------------------
// Test isolation
// ---------------------------------------------------------------------------

const SUFFIX = `ts_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

const app = createApp();

// User cookies
let interviewerCookie: string;
let interviewer2Cookie: string;
let coordCookie: string;
let candidateCookie: string; // candidate kind JWT via /auth/candidate-login

// IDs
let interviewerId: number;
let interviewer2Id: number;
let positionId: number;
let candidateId: number;
let candidateOneTimeCode: string;

// Slot IDs created during tests (for cleanup)
const createdSlotIds: number[] = [];

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

/** Date string: today + N days, YYYY-MM-DD (UTC). */
function todayPlus(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const da = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Yesterday's date string. */
function yesterday(): string {
  return todayPlus(-1);
}

/** Create a slot via POST and track its ID. */
async function createTestSlot(
  cookie: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<{ id: number; date: string; startTime: string; endTime: string }> {
  const res = await request(app)
    .post('/time-slots')
    .set('Cookie', [cookie])
    .send({ date, startTime, endTime });
  expect(res.status).toBe(201);
  const slot = (res.body as { slot: { id: number; date: string; startTime: string; endTime: string } }).slot;
  createdSlotIds.push(slot.id);
  return slot;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create interviewer 1
  const iv1 = await prisma.user.create({
    data: {
      username: `iv1_${SUFFIX}`,
      passwordHash: await hashPassword('Interview1!'),
      name: `Interviewer One ${SUFFIX}`,
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewerId = iv1.id;

  // Create interviewer 2 (for "other interviewer" tests)
  const iv2 = await prisma.user.create({
    data: {
      username: `iv2_${SUFFIX}`,
      passwordHash: await hashPassword('Interview2!'),
      name: `Interviewer Two ${SUFFIX}`,
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewer2Id = iv2.id;

  // Create coordinator
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Coord1234!'),
      name: `Coordinator ${SUFFIX}`,
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Create a position and assign interviewer1
  const pos = await prisma.position.create({
    data: {
      name: `pos_${SUFFIX}`,
      interviewers: { create: [{ userId: interviewerId }] },
    },
  });
  positionId = pos.id;

  // Create a candidate (for booking tests and candidate /available access)
  // Phone required for candidate-login (phoneLast4 check)
  const cand = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: `OTC${SUFFIX.slice(-6)}`,
      name: `Candidate ${SUFFIX}`,
      phone: '13800001234', // last 4: 1234
    },
  });
  candidateId = cand.id;
  candidateOneTimeCode = cand.oneTimeCode;

  // Login
  interviewerCookie = await loginAs(`iv1_${SUFFIX}`, 'Interview1!');
  interviewer2Cookie = await loginAs(`iv2_${SUFFIX}`, 'Interview2!');
  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Coord1234!');

  // Candidate login via OTC + phoneLast4
  const candLoginRes = await request(app)
    .post('/auth/candidate-login')
    .send({ oneTimeCode: candidateOneTimeCode, phoneLast4: '1234' });
  expect(candLoginRes.status).toBe(200);
  const candCookieRaw = extractCookie(candLoginRes);
  expect(candCookieRaw).toBeDefined();
  candidateCookie = candCookieRaw!;
});

afterAll(async () => {
  // Delete all created time slots
  if (createdSlotIds.length > 0) {
    await prisma.timeSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
  }
  // Delete any remaining slots for our interviewers
  await prisma.timeSlot.deleteMany({
    where: { interviewerId: { in: [interviewerId, interviewer2Id] } },
  });

  // Delete candidate
  await prisma.candidate.deleteMany({ where: { positionId } });

  // Delete position
  await prisma.position.deleteMany({ where: { id: positionId } });

  // Delete users
  await prisma.user.deleteMany({
    where: { username: { in: [`iv1_${SUFFIX}`, `iv2_${SUFFIX}`, `coord_${SUFFIX}`] } },
  });

  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

describe('Auth enforcement', () => {
  it('GET /time-slots/mine returns 401 without auth', async () => {
    const res = await request(app).get('/time-slots/mine');
    expect(res.status).toBe(401);
  });

  it('POST /time-slots returns 401 without auth', async () => {
    const res = await request(app).post('/time-slots').send({ date: todayPlus(1), startTime: '09:00', endTime: '10:00' });
    expect(res.status).toBe(401);
  });

  it('PATCH /time-slots/1 returns 401 without auth', async () => {
    const res = await request(app).patch('/time-slots/1').send({ startTime: '09:00' });
    expect(res.status).toBe(401);
  });

  it('DELETE /time-slots/1 returns 401 without auth', async () => {
    const res = await request(app).delete('/time-slots/1');
    expect(res.status).toBe(401);
  });

  it('GET /time-slots/mine returns 403 for coordinator (not interviewer)', async () => {
    const res = await request(app).get('/time-slots/mine').set('Cookie', [coordCookie]);
    expect(res.status).toBe(403);
  });

  it('GET /time-slots/available returns 401 without auth', async () => {
    const res = await request(app).get('/time-slots/available');
    expect(res.status).toBe(401);
  });

  it('GET /time-slots/available returns 403 for interviewer', async () => {
    const res = await request(app).get('/time-slots/available').set('Cookie', [interviewerCookie]);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /time-slots — create slot
// ---------------------------------------------------------------------------

describe('POST /time-slots — create', () => {
  it('[TC-5.1-002] creates a slot in window (today+1) and returns 201', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(1), startTime: '09:00', endTime: '10:00' });

    expect(res.status).toBe(201);
    const { slot } = res.body as { slot: Record<string, unknown> };
    expect(slot).toHaveProperty('id');
    expect(slot.date).toBe(todayPlus(1));
    expect(slot.startTime).toBe('09:00');
    expect(slot.endTime).toBe('10:00');
    expect(slot.candidate).toBeNull();
    createdSlotIds.push(slot.id as number);
  });

  it('creates a slot on today (boundary)', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(0), startTime: '08:00', endTime: '08:30' });

    expect(res.status).toBe(201);
    createdSlotIds.push((res.body as { slot: { id: number } }).slot.id);
  });

  it('creates a slot on today+28 (boundary)', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(28), startTime: '14:00', endTime: '15:00' });

    expect(res.status).toBe(201);
    createdSlotIds.push((res.body as { slot: { id: number } }).slot.id);
  });

  it('[TC-5.1-010] returns 400 OUT_OF_WINDOW for yesterday', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: yesterday(), startTime: '09:00', endTime: '10:00' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUT_OF_WINDOW');
  });

  it('[TC-5.1-010] returns 400 OUT_OF_WINDOW for today+29', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(29), startTime: '09:00', endTime: '10:00' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUT_OF_WINDOW');
  });

  it('[TC-5.1-011] returns 400 INVALID_TIME_RANGE when end <= start', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(2), startTime: '10:00', endTime: '09:00' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIME_RANGE');
  });

  it('[TC-5.1-011] returns 400 INVALID_TIME_RANGE when end == start', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(2), startTime: '10:00', endTime: '10:00' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIME_RANGE');
  });

  it('[TC-5.1-011] returns 400 INVALID_TIME_RANGE for 5 minute slot (too short)', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(2), startTime: '10:00', endTime: '10:05' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIME_RANGE');
  });

  it('[TC-5.1-011] returns 400 INVALID_TIME_RANGE for 5 hour slot (too long)', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(2), startTime: '08:00', endTime: '13:00' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIME_RANGE');
  });

  it('returns 409 OVERLAP when a new slot overlaps existing', async () => {
    // Create base slot: 11:00-12:00
    const base = await createTestSlot(interviewerCookie, todayPlus(3), '11:00', '12:00');
    expect(base.id).toBeDefined();

    // Overlapping slot: 11:30-12:30
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(3), startTime: '11:30', endTime: '12:30' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OVERLAP');
  });

  it('does NOT overlap if same time on different dates', async () => {
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(4), startTime: '11:00', endTime: '12:00' });

    expect(res.status).toBe(201);
    createdSlotIds.push((res.body as { slot: { id: number } }).slot.id);
  });

  it('does NOT overlap for different interviewers on same date/time', async () => {
    // interviewer2 creates same time on same date
    const res = await request(app)
      .post('/time-slots')
      .set('Cookie', [interviewer2Cookie])
      .send({ date: todayPlus(3), startTime: '11:00', endTime: '12:00' });

    expect(res.status).toBe(201);
    createdSlotIds.push((res.body as { slot: { id: number } }).slot.id);
  });
});

// ---------------------------------------------------------------------------
// GET /time-slots/mine
// ---------------------------------------------------------------------------

describe('GET /time-slots/mine', () => {
  let slotId: number;

  beforeAll(async () => {
    const s = await createTestSlot(interviewerCookie, todayPlus(5), '13:00', '14:00');
    slotId = s.id;
  });

  it('[TC-5.1-001] returns slots for own interviewer', async () => {
    const res = await request(app)
      .get('/time-slots/mine')
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number }[] };
    expect(Array.isArray(slots)).toBe(true);
    const ids = slots.map((s) => s.id);
    expect(ids).toContain(slotId);
  });

  it('[TC-5.1-004] returns slots with correct shape', async () => {
    const res = await request(app)
      .get('/time-slots/mine')
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: Record<string, unknown>[] };
    for (const slot of slots) {
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('date');
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot).toHaveProperty('interviewerId');
      expect(slot).toHaveProperty('candidateId');
      expect(slot).toHaveProperty('candidateName');
      expect(slot).toHaveProperty('positionName');
      expect(slot).toHaveProperty('candidate');
    }
  });

  it('returns booked candidate fields for interviewer calendar display', async () => {
    const booked = await createTestSlot(interviewerCookie, todayPlus(5), '14:30', '15:30');
    await prisma.timeSlot.update({
      where: { id: booked.id },
      data: { candidateId },
    });

    const res = await request(app)
      .get(`/time-slots/mine?from=${todayPlus(5)}&to=${todayPlus(5)}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as {
      slots: {
        id: number;
        candidateId: number | null;
        candidateName: string | null;
        positionName: string | null;
      }[];
    };
    const slot = slots.find(s => s.id === booked.id);
    expect(slot).toBeDefined();
    expect(slot!.candidateId).toBe(candidateId);
    expect(slot!.candidateName).toBe(`Candidate ${SUFFIX}`);
    expect(slot!.positionName).toBe(`pos_${SUFFIX}`);

    await prisma.timeSlot.update({
      where: { id: booked.id },
      data: { candidateId: null },
    });
  });

  it('[TC-5.1-001] filters by ?from and ?to', async () => {
    const from = todayPlus(5);
    const to = todayPlus(5);
    const res = await request(app)
      .get(`/time-slots/mine?from=${from}&to=${to}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number; date: string }[] };
    for (const slot of slots) {
      expect(slot.date).toBe(from);
    }
    const ids = slots.map((s) => s.id);
    expect(ids).toContain(slotId);
  });

  it('[TC-5.1-013] does NOT return slots of another interviewer', async () => {
    const res = await request(app)
      .get('/time-slots/mine')
      .set('Cookie', [interviewer2Cookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number }[] };
    const ids = slots.map((s) => s.id);
    // slotId was created by interviewer 1
    expect(ids).not.toContain(slotId);
  });
});

// ---------------------------------------------------------------------------
// PATCH /time-slots/:id
// ---------------------------------------------------------------------------

describe('PATCH /time-slots/:id', () => {
  let unbookedSlotId: number;
  let bookedSlotId: number;
  let otherSlotId: number; // owned by interviewer2

  beforeAll(async () => {
    // Create unbooked slot for interviewer1
    const s1 = await createTestSlot(interviewerCookie, todayPlus(6), '09:00', '10:00');
    unbookedSlotId = s1.id;

    // Create a slot and book it by attaching a candidate directly in DB
    const s2 = await createTestSlot(interviewerCookie, todayPlus(6), '10:30', '11:30');
    bookedSlotId = s2.id;
    await prisma.timeSlot.update({
      where: { id: bookedSlotId },
      data: { candidateId },
    });

    // Create slot for interviewer2
    const s3 = await createTestSlot(interviewer2Cookie, todayPlus(6), '09:00', '10:00');
    otherSlotId = s3.id;
  });

  afterAll(async () => {
    // Unbook the booked slot so cleanup can proceed
    await prisma.timeSlot.updateMany({
      where: { id: bookedSlotId },
      data: { candidateId: null },
    });
  });

  it('successfully patches an unbooked slot', async () => {
    const res = await request(app)
      .patch(`/time-slots/${unbookedSlotId}`)
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '09:15' });

    expect(res.status).toBe(200);
    const { slot } = res.body as { slot: Record<string, unknown> };
    expect(slot.startTime).toBe('09:15');
    expect(slot.id).toBe(unbookedSlotId);
  });

  it('returns 409 ALREADY_BOOKED when patching a booked slot', async () => {
    const res = await request(app)
      .patch(`/time-slots/${bookedSlotId}`)
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '10:45' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_BOOKED');
  });

  it('returns 404 NOT_FOUND when patching another interviewer slot', async () => {
    const res = await request(app)
      .patch(`/time-slots/${otherSlotId}`)
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '09:15' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for non-existent slot', async () => {
    const res = await request(app)
      .patch('/time-slots/999999999')
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '09:15' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 400 OUT_OF_WINDOW when patching date outside window', async () => {
    const res = await request(app)
      .patch(`/time-slots/${unbookedSlotId}`)
      .set('Cookie', [interviewerCookie])
      .send({ date: todayPlus(29) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUT_OF_WINDOW');
  });

  it('returns 409 OVERLAP when patch creates overlap', async () => {
    // Create a second slot at 11:00 on todayPlus(7)
    const base = await createTestSlot(interviewerCookie, todayPlus(7), '11:00', '12:00');
    // Create another slot at 13:00 on todayPlus(7) — no overlap yet
    const target = await createTestSlot(interviewerCookie, todayPlus(7), '13:00', '14:00');

    // Now patch target to overlap base
    const res = await request(app)
      .patch(`/time-slots/${target.id}`)
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '11:30', endTime: '12:30' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OVERLAP');
  });
});

// ---------------------------------------------------------------------------
// DELETE /time-slots/:id
// ---------------------------------------------------------------------------

describe('DELETE /time-slots/:id', () => {
  let unbookedSlotId: number;
  let bookedSlotId: number;
  let otherSlotId: number;

  beforeAll(async () => {
    const s1 = await createTestSlot(interviewerCookie, todayPlus(8), '09:00', '09:30');
    unbookedSlotId = s1.id;

    const s2 = await createTestSlot(interviewerCookie, todayPlus(8), '10:00', '11:00');
    bookedSlotId = s2.id;
    await prisma.timeSlot.update({
      where: { id: bookedSlotId },
      data: { candidateId },
    });

    const s3 = await createTestSlot(interviewer2Cookie, todayPlus(8), '09:00', '09:30');
    otherSlotId = s3.id;
  });

  afterAll(async () => {
    // Unbook the booked slot so afterAll cleanup works
    await prisma.timeSlot.updateMany({
      where: { id: bookedSlotId },
      data: { candidateId: null },
    });
  });

  it('[TC-5.1-006] deletes an unbooked slot and returns {ok: true}', async () => {
    const res = await request(app)
      .delete(`/time-slots/${unbookedSlotId}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify gone
    const check = await request(app)
      .patch(`/time-slots/${unbookedSlotId}`)
      .set('Cookie', [interviewerCookie])
      .send({ startTime: '09:00' });
    expect(check.status).toBe(404);
  });

  it('[TC-5.1-007] returns 409 ALREADY_BOOKED when deleting a booked slot', async () => {
    const res = await request(app)
      .delete(`/time-slots/${bookedSlotId}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_BOOKED');
  });

  it('returns 404 NOT_FOUND when deleting another interviewer slot', async () => {
    const res = await request(app)
      .delete(`/time-slots/${otherSlotId}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 for non-existent slot', async () => {
    const res = await request(app)
      .delete('/time-slots/999999999')
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /time-slots/available
// ---------------------------------------------------------------------------

describe('GET /time-slots/available', () => {
  let unbookedSlotId: number;
  let bookedSlotId: number;
  let iv2SlotId: number;

  beforeAll(async () => {
    // Create an unbooked slot for interviewer1
    const s1 = await createTestSlot(interviewerCookie, todayPlus(9), '10:00', '11:00');
    unbookedSlotId = s1.id;

    // Create a booked slot for interviewer1
    const s2 = await createTestSlot(interviewerCookie, todayPlus(9), '12:00', '13:00');
    bookedSlotId = s2.id;
    await prisma.timeSlot.update({
      where: { id: bookedSlotId },
      data: { candidateId },
    });

    // Create an unbooked slot for interviewer2 (NOT assigned to our position)
    const s3 = await createTestSlot(interviewer2Cookie, todayPlus(9), '10:00', '11:00');
    iv2SlotId = s3.id;
  });

  afterAll(async () => {
    // Unbook
    await prisma.timeSlot.updateMany({
      where: { id: bookedSlotId },
      data: { candidateId: null },
    });
  });

  it('coordinator can call /available', async () => {
    const res = await request(app)
      .get('/time-slots/available')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
  });

  it('candidate can call /available', async () => {
    const res = await request(app)
      .get('/time-slots/available')
      .set('Cookie', [candidateCookie]);
    expect(res.status).toBe(200);
  });

  it('filters out booked slots', async () => {
    const res = await request(app)
      .get('/time-slots/available')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number }[] };
    const ids = slots.map((s) => s.id);
    expect(ids).not.toContain(bookedSlotId);
    expect(ids).toContain(unbookedSlotId);
  });

  it('includes interviewer info in each slot', async () => {
    const res = await request(app)
      .get('/time-slots/available')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: Record<string, unknown>[] };
    for (const slot of slots) {
      const iv = slot.interviewer as { id: number; name: string };
      expect(iv).toHaveProperty('id');
      expect(iv).toHaveProperty('name');
    }
  });

  it('with positionId returns only slots of assigned interviewers', async () => {
    // positionId has interviewer1 assigned, not interviewer2
    const res = await request(app)
      .get(`/time-slots/available?positionId=${positionId}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number; interviewer: { id: number } }[] };
    const ids = slots.map((s) => s.id);
    expect(ids).toContain(unbookedSlotId);
    expect(ids).not.toContain(iv2SlotId);
  });

  it('with positionId does NOT return booked slots of assigned interviewers', async () => {
    const res = await request(app)
      .get(`/time-slots/available?positionId=${positionId}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number }[] };
    const ids = slots.map((s) => s.id);
    expect(ids).not.toContain(bookedSlotId);
  });

  it('does not return out-of-window slots', async () => {
    // Directly insert a slot with date = yesterday (past window)
    const past = new Date();
    past.setUTCHours(0, 0, 0, 0);
    past.setUTCDate(past.getUTCDate() - 1);

    const startTime = new Date(Date.UTC(1970, 0, 1, 8, 0, 0));
    const endTime = new Date(Date.UTC(1970, 0, 1, 9, 0, 0));

    const oldSlot = await prisma.timeSlot.create({
      data: {
        interviewerId,
        date: past,
        startTime,
        endTime,
      },
    });
    createdSlotIds.push(oldSlot.id);

    const res = await request(app)
      .get('/time-slots/available')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { slots } = res.body as { slots: { id: number }[] };
    const ids = slots.map((s) => s.id);
    expect(ids).not.toContain(oldSlot.id);
  });
});
