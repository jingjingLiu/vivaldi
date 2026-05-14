import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { CandidateStatus, Role, UserNotificationEvent } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

// ---------------------------------------------------------------------------
// Test isolation
// ---------------------------------------------------------------------------

const RUN_ID = Date.now(); // unique per test-run
const SUFFIX = `cs_${RUN_ID}`;
const COOKIE_NAME = 'vivaldi_session';

const app = createApp();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let interviewerId: number;
let positionId: number;
let candidateId: number;
let candidateCookie: string;

// A second candidate in 'new' status to test WRONG_STATE
let newStatusCandidateId: number;
let newStatusCandidateCookie: string;

// A coordinator for non-candidate auth check
let coordCookie: string;
let coordId: number;

// Slot IDs for cleanup
const createdSlotIds: number[] = [];
const createdCandidateIds: number[] = [];

// ---------------------------------------------------------------------------
// Unique code / phone helpers
// ---------------------------------------------------------------------------

let _codeSeq = 0;

/** Generates a unique one-time code that fits within 10 chars and passes DB unique constraint */
function nextOTC(): string {
  _codeSeq++;
  // e.g. "C1ABCD001" — base36 timestamp slice + 3-digit counter
  const ts = RUN_ID.toString(36).toUpperCase().slice(-5);
  const cnt = _codeSeq.toString().padStart(3, '0');
  return `C${ts}${cnt}`.slice(0, 10);
}

/** Phone ending in the last4 digits supplied */
function phoneWith(last4: string): string {
  return `1380000${last4}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
}

async function loginInternal(username: string, password: string): Promise<string> {
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
  const cookie = extractCookie(res);
  expect(cookie).toBeDefined();
  return cookie!;
}

/** Create a candidate in given status, returns {id, cookie, code} */
async function createTestCandidate(
  status: CandidateStatus,
  last4: string,
): Promise<{ id: number; cookie: string; code: string }> {
  const code = nextOTC();
  const cand = await prisma.candidate.create({
    data: {
      positionId,
      status,
      oneTimeCode: code,
      name: `TestCand-${code}`,
      phone: phoneWith(last4),
    },
  });
  createdCandidateIds.push(cand.id);
  const cookie = await candidateLogin(code, last4);
  return { id: cand.id, cookie, code };
}

/** UTC date string YYYY-MM-DD, today + n days */
function todayPlus(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Create a TimeSlot directly in DB for the given interviewer and day offset */
async function createSlotInDb(ivId: number, dayOffset: number): Promise<number> {
  const dateVal = new Date();
  dateVal.setUTCHours(0, 0, 0, 0);
  dateVal.setUTCDate(dateVal.getUTCDate() + dayOffset);

  const slot = await prisma.timeSlot.create({
    data: {
      interviewerId: ivId,
      date: dateVal,
      startTime: new Date(Date.UTC(1970, 0, 1, 10, 0, 0)),
      endTime: new Date(Date.UTC(1970, 0, 1, 11, 0, 0)),
    },
  });
  createdSlotIds.push(slot.id);
  return slot.id;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Ensure system settings exist
  await prisma.systemSetting.upsert({
    where: { key: 'oa_deadline_days' },
    update: {},
    create: { key: 'oa_deadline_days', value: '7' },
  });

  // Create interviewer
  const iv = await prisma.user.create({
    data: {
      username: `iv_${SUFFIX}`,
      passwordHash: await hashPassword('Interview1!'),
      name: `Interviewer ${SUFFIX}`,
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewerId = iv.id;

  // Create coordinator
  const coord = await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Coord1234!'),
      name: `Coord ${SUFFIX}`,
      roles: { create: [{ role: Role.coordinator }] },
    },
  });
  coordId = coord.id;
  coordCookie = await loginInternal(`coord_${SUFFIX}`, 'Coord1234!');

  // Create position and assign interviewer
  const pos = await prisma.position.create({
    data: {
      name: `pos_${SUFFIX}`,
      interviewers: { create: [{ userId: interviewerId }] },
    },
  });
  positionId = pos.id;

  // Create main candidate in wait_to_confirm_date status
  const mainCode = nextOTC();
  const cand = await prisma.candidate.create({
    data: {
      positionId,
      status: CandidateStatus.wait_to_confirm_date,
      oneTimeCode: mainCode,
      name: `MainCandidate ${SUFFIX}`,
      phone: phoneWith('1234'),
    },
  });
  candidateId = cand.id;
  createdCandidateIds.push(candidateId);
  candidateCookie = await candidateLogin(mainCode, '1234');

  // Create second candidate in 'new' status for WRONG_STATE tests
  const newCode = nextOTC();
  const newCand = await prisma.candidate.create({
    data: {
      positionId,
      status: CandidateStatus.new,
      oneTimeCode: newCode,
      name: `NewStatusCand ${SUFFIX}`,
      phone: phoneWith('5678'),
    },
  });
  newStatusCandidateId = newCand.id;
  createdCandidateIds.push(newStatusCandidateId);
  newStatusCandidateCookie = await candidateLogin(newCode, '5678');
});

afterAll(async () => {
  // Unbook any slots first (reset candidateId), then delete
  if (createdSlotIds.length > 0) {
    await prisma.timeSlot.updateMany({
      where: { id: { in: createdSlotIds } },
      data: { candidateId: null },
    });
    await prisma.timeSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
  }

  // Delete status history + candidates
  if (createdCandidateIds.length > 0) {
    await prisma.statusHistory.deleteMany({
      where: { candidateId: { in: createdCandidateIds } },
    });
    await prisma.userNotification.deleteMany({
      where: { candidateId: { in: createdCandidateIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }

  // Delete position (cascades PositionInterviewer)
  await prisma.position.deleteMany({ where: { id: positionId } });

  // Delete users
  await prisma.user.deleteMany({
    where: { username: { in: [`iv_${SUFFIX}`, `coord_${SUFFIX}`] } },
  });

  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

describe('Auth enforcement', () => {
  it('GET /candidate/time-slots/available returns 401 without auth', async () => {
    const res = await request(app).get('/candidate/time-slots/available');
    expect(res.status).toBe(401);
  });

  it('GET /candidate/time-slots/mine returns 401 without auth', async () => {
    const res = await request(app).get('/candidate/time-slots/mine');
    expect(res.status).toBe(401);
  });

  it('POST /candidate/time-slots/1/book returns 401 without auth', async () => {
    const res = await request(app).post('/candidate/time-slots/1/book');
    expect(res.status).toBe(401);
  });

  it('GET /candidate/time-slots/available returns 403 for coordinator (non-candidate)', async () => {
    const res = await request(app)
      .get('/candidate/time-slots/available')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(403);
  });

  it('GET /candidate/time-slots/mine returns 403 for coordinator (non-candidate)', async () => {
    const res = await request(app)
      .get('/candidate/time-slots/mine')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(403);
  });

  it('POST /candidate/time-slots/1/book returns 403 for coordinator (non-candidate)', async () => {
    const res = await request(app)
      .post('/candidate/time-slots/1/book')
      .set('Cookie', [coordCookie]);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /candidate/time-slots/available
// ---------------------------------------------------------------------------

describe('GET /candidate/time-slots/available', () => {
  let slot1Id: number;
  let slot2Id: number;
  let slot3Id: number;

  beforeAll(async () => {
    slot1Id = await createSlotInDb(interviewerId, 3);
    slot2Id = await createSlotInDb(interviewerId, 5);
    slot3Id = await createSlotInDb(interviewerId, 7);
  });

  it('[TC-5.2-001] returns all 3 available slots with interviewer info for wait_to_confirm_date candidate', async () => {
    const res = await request(app)
      .get('/candidate/time-slots/available')
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(200);
    const { slots, state } = res.body as {
      slots: { id: number; interviewer: { id: number; name: string } }[];
      state: string;
    };
    expect(state).toBe('wait_to_confirm_date');

    const ids = slots.map((s) => s.id);
    expect(ids).toContain(slot1Id);
    expect(ids).toContain(slot2Id);
    expect(ids).toContain(slot3Id);

    // Check shape
    for (const slot of slots) {
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('date');
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot.interviewer).toHaveProperty('id');
      expect(slot.interviewer).toHaveProperty('name');
    }
  });

  it('[TC-5.2-006] returns empty slots + state:"new" for candidate in new status (tolerant)', async () => {
    const res = await request(app)
      .get('/candidate/time-slots/available')
      .set('Cookie', [newStatusCandidateCookie]);

    expect(res.status).toBe(200);
    const { slots, state } = res.body as { slots: unknown[]; state: string };
    expect(slots).toEqual([]);
    expect(state).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// GET /candidate/time-slots/mine — no booking
// ---------------------------------------------------------------------------

describe('GET /candidate/time-slots/mine — no booking', () => {
  it('[TC-5.2-004] returns {slot: null} when candidate has no booking', async () => {
    // newStatusCandidateCookie never books anything, use it as a clean check
    const res = await request(app)
      .get('/candidate/time-slots/mine')
      .set('Cookie', [newStatusCandidateCookie]);

    expect(res.status).toBe(200);
    expect(res.body.slot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — success + GET /mine
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — success', () => {
  let bookableSlotId: number;
  // Separate candidate so other describe blocks don't race with the main candidate's state
  let freshCand: { id: number; cookie: string };

  beforeAll(async () => {
    bookableSlotId = await createSlotInDb(interviewerId, 4);
    freshCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9001');
  });

  it('[TC-5.2-002] books slot successfully → status transitions to date_confirmed', async () => {
    const res = await request(app)
      .post(`/candidate/time-slots/${bookableSlotId}/book`)
      .set('Cookie', [freshCand.cookie]);

    expect(res.status).toBe(200);
    const { slot, candidateStatus } = res.body as {
      slot: {
        id: number;
        date: string;
        startTime: string;
        endTime: string;
        interviewer: { id: number; name: string };
      };
      candidateStatus: string;
    };

    expect(slot.id).toBe(bookableSlotId);
    expect(slot).toHaveProperty('date');
    expect(slot).toHaveProperty('startTime');
    expect(slot).toHaveProperty('endTime');
    expect(slot.interviewer.id).toBe(interviewerId);
    expect(candidateStatus).toBe('date_confirmed');

    const notifications = await prisma.userNotification.findMany({
      where: {
        candidateId: freshCand.id,
        event: UserNotificationEvent.interview_booked,
      },
      select: { userId: true, title: true },
    });
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: interviewerId, title: '候选人已确认面试时间' }),
        expect.objectContaining({ userId: coordId, title: '候选人已确认面试时间' }),
      ]),
    );
  });

  it('[TC-5.2-003] GET /mine returns the booked slot after booking', async () => {
    const res = await request(app)
      .get('/candidate/time-slots/mine')
      .set('Cookie', [freshCand.cookie]);

    expect(res.status).toBe(200);
    const { slot } = res.body as {
      slot: { id: number; interviewer: { id: number; name: string } } | null;
    };
    expect(slot).not.toBeNull();
    expect(slot!.id).toBe(bookableSlotId);
    expect(slot!.interviewer.id).toBe(interviewerId);
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — ALREADY_BOOKED_OWN
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — ALREADY_BOOKED_OWN', () => {
  let alreadyBookedCand: { id: number; cookie: string };
  let preBookedSlotId: number;

  beforeAll(async () => {
    alreadyBookedCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9002');
    // Pre-book a slot directly in the DB so candidate stays in wait_to_confirm_date
    // but already has a slot. This is the ALREADY_BOOKED_OWN scenario.
    preBookedSlotId = await createSlotInDb(interviewerId, 11);
    await prisma.timeSlot.update({
      where: { id: preBookedSlotId },
      data: { candidateId: alreadyBookedCand.id },
    });
  });

  afterAll(async () => {
    // Clean up the pre-booked slot
    await prisma.timeSlot.update({
      where: { id: preBookedSlotId },
      data: { candidateId: null },
    });
  });

  it('[TC-5.2-005] returns 409 ALREADY_BOOKED_OWN when candidate already has a booked slot', async () => {
    const s2 = await createSlotInDb(interviewerId, 12);
    const res = await request(app)
      .post(`/candidate/time-slots/${s2}/book`)
      .set('Cookie', [alreadyBookedCand.cookie]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_BOOKED_OWN');
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — SLOT_TAKEN
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — SLOT_TAKEN', () => {
  it('[TC-5.2-005] returns 409 SLOT_TAKEN when slot candidateId is already set (race condition)', async () => {
    // Slot pre-booked by seeding candidateId directly
    const takerCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9003');
    const victimCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9004');

    const takenSlotId = await createSlotInDb(interviewerId, 13);

    // Pre-book by taker
    await prisma.timeSlot.update({
      where: { id: takenSlotId },
      data: { candidateId: takerCand.id },
    });

    // Victim tries to book — should get SLOT_TAKEN
    const res = await request(app)
      .post(`/candidate/time-slots/${takenSlotId}/book`)
      .set('Cookie', [victimCand.cookie]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOT_TAKEN');

    // Cleanup: clear the booking so teardown can delete slot
    await prisma.timeSlot.update({
      where: { id: takenSlotId },
      data: { candidateId: null },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — SLOT_OUT_OF_WINDOW
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — SLOT_OUT_OF_WINDOW', () => {
  it('[TC-5.2-007] returns 400 SLOT_OUT_OF_WINDOW for a slot at today+40 (bypassed window at creation)', async () => {
    const farCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9005');

    // Create slot at today+40, bypassing the window check
    const farDate = new Date();
    farDate.setUTCHours(0, 0, 0, 0);
    farDate.setUTCDate(farDate.getUTCDate() + 40);

    const farSlot = await prisma.timeSlot.create({
      data: {
        interviewerId,
        date: farDate,
        startTime: new Date(Date.UTC(1970, 0, 1, 14, 0, 0)),
        endTime: new Date(Date.UTC(1970, 0, 1, 15, 0, 0)),
      },
    });
    createdSlotIds.push(farSlot.id);

    const res = await request(app)
      .post(`/candidate/time-slots/${farSlot.id}/book`)
      .set('Cookie', [farCand.cookie]);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SLOT_OUT_OF_WINDOW');
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — SLOT_WRONG_POSITION
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — SLOT_WRONG_POSITION', () => {
  let otherInterviewerId: number;
  let otherPositionId: number;
  let wrongPosSlotId: number;

  beforeAll(async () => {
    // Create a second interviewer and position (not linked to main positionId)
    const otherIv = await prisma.user.create({
      data: {
        username: `iv2_${SUFFIX}`,
        passwordHash: await hashPassword('OtherIv1!'),
        name: `OtherIv ${SUFFIX}`,
        roles: { create: [{ role: Role.interviewer }] },
      },
    });
    otherInterviewerId = otherIv.id;

    const otherPos = await prisma.position.create({
      data: {
        name: `otherpos_${SUFFIX}`,
        interviewers: { create: [{ userId: otherInterviewerId }] },
      },
    });
    otherPositionId = otherPos.id;

    // Slot for the other interviewer (not assigned to main position)
    const wrongSlot = await prisma.timeSlot.create({
      data: {
        interviewerId: otherInterviewerId,
        date: new Date(new Date().setUTCHours(0, 0, 0, 0) + 9 * 24 * 60 * 60 * 1000),
        startTime: new Date(Date.UTC(1970, 0, 1, 16, 0, 0)),
        endTime: new Date(Date.UTC(1970, 0, 1, 17, 0, 0)),
      },
    });
    createdSlotIds.push(wrongSlot.id);
    wrongPosSlotId = wrongSlot.id;
  });

  afterAll(async () => {
    await prisma.timeSlot.deleteMany({ where: { interviewerId: otherInterviewerId } });
    await prisma.position.deleteMany({ where: { id: otherPositionId } });
    await prisma.user.deleteMany({ where: { id: otherInterviewerId } });
  });

  it('returns 400 SLOT_WRONG_POSITION for slot of interviewer not assigned to candidate position', async () => {
    // Candidate is on main positionId; slot belongs to otherInterviewerId (only on otherPositionId)
    const wrongPosCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9006');

    const res = await request(app)
      .post(`/candidate/time-slots/${wrongPosSlotId}/book`)
      .set('Cookie', [wrongPosCand.cookie]);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SLOT_WRONG_POSITION');
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — WRONG_STATE
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — WRONG_STATE', () => {
  it('[TC-5.2-006] returns 403 WRONG_STATE for candidate in new status', async () => {
    const slotId = await createSlotInDb(interviewerId, 15);

    const res = await request(app)
      .post(`/candidate/time-slots/${slotId}/book`)
      .set('Cookie', [newStatusCandidateCookie]);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_STATE');
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book — SLOT_NOT_FOUND
// ---------------------------------------------------------------------------

describe('POST /candidate/time-slots/:slotId/book — SLOT_NOT_FOUND', () => {
  it('returns 404 SLOT_NOT_FOUND for non-existent slot', async () => {
    const notFoundCand = await createTestCandidate(CandidateStatus.wait_to_confirm_date, '9007');

    const res = await request(app)
      .post('/candidate/time-slots/999999999/book')
      .set('Cookie', [notFoundCand.cookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SLOT_NOT_FOUND');
  });
});
