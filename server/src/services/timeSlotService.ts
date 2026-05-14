import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 28;
const MIN_DURATION_MIN = 15;
const MAX_DURATION_MIN = 240;

// ---------------------------------------------------------------------------
// Date / Time helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's date at midnight UTC (time stripped).
 */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Parse an ISO date string "YYYY-MM-DD" into a UTC midnight Date.
 */
function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new HttpError(400, 'VALIDATION_ERROR', `Invalid date: ${s}`);
  return d;
}

/**
 * Parse a time string "HH:MM" into a Prisma-compatible Time DateTime
 * (stored as 1970-01-01 epoch + time-of-day in UTC).
 */
function parseTime(s: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(s);
  if (!match) throw new HttpError(400, 'VALIDATION_ERROR', `Invalid time: ${s}`);
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 23 || m > 59) throw new HttpError(400, 'VALIDATION_ERROR', `Invalid time: ${s}`);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0, 0));
}

/**
 * Format a Date back to "HH:MM" — works for both epoch-based Time values
 * and any Date with a valid UTC time component.
 */
function formatTime(d: Date): string {
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Format a UTC-midnight Date back to "YYYY-MM-DD".
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const da = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * Validate that a given date is within [today, today+28].
 */
function assertInWindow(date: Date): void {
  const today = todayUtc();
  const limit = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (date < today || date > limit) {
    throw new HttpError(
      400,
      'OUT_OF_WINDOW',
      `Date must be between today and today+${WINDOW_DAYS} days`,
    );
  }
}

/**
 * Validate startTime < endTime and duration constraints.
 */
function assertValidRange(startTime: Date, endTime: Date): void {
  const startMin = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
  const endMin = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
  const durationMin = endMin - startMin;
  if (durationMin <= 0) {
    throw new HttpError(400, 'INVALID_TIME_RANGE', 'endTime must be after startTime');
  }
  if (durationMin < MIN_DURATION_MIN) {
    throw new HttpError(
      400,
      'INVALID_TIME_RANGE',
      `Slot duration must be at least ${MIN_DURATION_MIN} minutes`,
    );
  }
  if (durationMin > MAX_DURATION_MIN) {
    throw new HttpError(
      400,
      'INVALID_TIME_RANGE',
      `Slot duration must be at most ${MAX_DURATION_MIN} minutes`,
    );
  }
}

// ---------------------------------------------------------------------------
// Overlap check
//
// NOTE: MySQL session may run in a non-UTC timezone (e.g. +08:00). When Prisma
// passes a JavaScript Date as a prepared-statement parameter for a @db.Time
// column, MySQL converts the UTC datetime to the session-local time before
// comparing. This means that e.g. "09:30 UTC" → "17:30 local" when the
// session is +08:00, corrupting time comparisons.
//
// Workaround: pass time values as plain "HH:MM:SS" strings via raw SQL so that
// no timezone conversion occurs. The date is passed as a "YYYY-MM-DD" string
// for the same reason (avoids DATE vs DATETIME timezone conversion).
// ---------------------------------------------------------------------------

async function assertNoOverlap(
  interviewerId: number,
  date: Date,
  startTime: Date,
  endTime: Date,
  excludeId?: number,
): Promise<void> {
  const dateStr = formatDate(date);
  const startStr = `${formatTime(startTime)}:00`;
  const endStr = `${formatTime(endTime)}:00`;

  type OverlapRow = { id: number };
  let rows: OverlapRow[];

  if (excludeId !== undefined) {
    rows = await prisma.$queryRaw<OverlapRow[]>(
      Prisma.sql`SELECT id FROM time_slots
        WHERE interviewer_id = ${interviewerId}
          AND date = ${dateStr}
          AND id != ${excludeId}
          AND start_time < ${endStr}
          AND end_time > ${startStr}
        LIMIT 1`,
    );
  } else {
    rows = await prisma.$queryRaw<OverlapRow[]>(
      Prisma.sql`SELECT id FROM time_slots
        WHERE interviewer_id = ${interviewerId}
          AND date = ${dateStr}
          AND start_time < ${endStr}
          AND end_time > ${startStr}
        LIMIT 1`,
    );
  }

  if (rows.length > 0) {
    throw new HttpError(409, 'OVERLAP', 'This slot overlaps an existing slot for this interviewer');
  }
}

// ---------------------------------------------------------------------------
// Serialization types
// ---------------------------------------------------------------------------

export interface SlotCandidate {
  id: number;
  name: string | null;
}

export interface SlotInterviewer {
  id: number;
  name: string;
}

export interface MySlot {
  id: number;
  interviewerId: number;
  date: string;
  startTime: string;
  endTime: string;
  candidateId: number | null;
  candidateName: string | null;
  positionName: string | null;
  candidate: SlotCandidate | null;
}

export interface AvailableSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  interviewer: SlotInterviewer;
}

// ---------------------------------------------------------------------------
// Internal Prisma result types
// ---------------------------------------------------------------------------

type SlotWithRelations = {
  id: number;
  interviewerId: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  candidate: { id: number; name: string | null; position: { name: string } } | null;
};

type SlotWithInterviewer = {
  id: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  interviewer: { id: number; name: string };
};

function serializeMySlot(s: SlotWithRelations): MySlot {
  return {
    id: s.id,
    interviewerId: s.interviewerId,
    date: formatDate(s.date),
    startTime: formatTime(s.startTime),
    endTime: formatTime(s.endTime),
    candidateId: s.candidate?.id ?? null,
    candidateName: s.candidate?.name ?? null,
    positionName: s.candidate?.position.name ?? null,
    candidate: s.candidate
      ? { id: s.candidate.id, name: s.candidate.name }
      : null,
  };
}

function serializeAvailableSlot(s: SlotWithInterviewer): AvailableSlot {
  return {
    id: s.id,
    date: formatDate(s.date),
    startTime: formatTime(s.startTime),
    endTime: formatTime(s.endTime),
    interviewer: { id: s.interviewer.id, name: s.interviewer.name },
  };
}

// ---------------------------------------------------------------------------
// listMySlots
// ---------------------------------------------------------------------------

export async function listMySlots(
  interviewerId: number,
  from?: string,
  to?: string,
): Promise<MySlot[]> {
  const today = todayUtc();
  const windowEnd = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const fromDate = from ? parseDate(from) : today;
  const toDate = to ? parseDate(to) : windowEnd;

  const slots = await prisma.timeSlot.findMany({
    where: {
      interviewerId,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    },
    include: {
      candidate: { select: { id: true, name: true, position: { select: { name: true } } } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  return slots.map(serializeMySlot);
}

// ---------------------------------------------------------------------------
// createSlot
// ---------------------------------------------------------------------------

export interface CreateSlotInput {
  date: string;
  startTime: string;
  endTime: string;
}

export async function createSlot(interviewerId: number, input: CreateSlotInput): Promise<MySlot> {
  const date = parseDate(input.date);
  const startTime = parseTime(input.startTime);
  const endTime = parseTime(input.endTime);

  assertInWindow(date);
  assertValidRange(startTime, endTime);
  await assertNoOverlap(interviewerId, date, startTime, endTime);

  const slot = await prisma.timeSlot.create({
    data: {
      interviewerId,
      date,
      startTime,
      endTime,
    },
    include: {
      candidate: { select: { id: true, name: true, position: { select: { name: true } } } },
    },
  });

  return serializeMySlot(slot);
}

// ---------------------------------------------------------------------------
// updateSlot
// ---------------------------------------------------------------------------

export interface UpdateSlotInput {
  date?: string;
  startTime?: string;
  endTime?: string;
}

export async function updateSlot(
  interviewerId: number,
  id: number,
  patch: UpdateSlotInput,
): Promise<MySlot> {
  const existing = await prisma.timeSlot.findFirst({
    where: { id },
    include: { candidate: { select: { id: true, name: true, position: { select: { name: true } } } } },
  });

  if (!existing || existing.interviewerId !== interviewerId) {
    throw new HttpError(404, 'NOT_FOUND', `Time slot ${id} not found`);
  }

  if (existing.candidateId !== null) {
    throw new HttpError(409, 'ALREADY_BOOKED', 'Cannot modify a booked time slot');
  }

  const date = patch.date ? parseDate(patch.date) : existing.date;
  const startTime = patch.startTime ? parseTime(patch.startTime) : existing.startTime;
  const endTime = patch.endTime ? parseTime(patch.endTime) : existing.endTime;

  assertInWindow(date);
  assertValidRange(startTime, endTime);
  await assertNoOverlap(interviewerId, date, startTime, endTime, id);

  const updated = await prisma.timeSlot.update({
    where: { id },
    data: { date, startTime, endTime },
    include: { candidate: { select: { id: true, name: true, position: { select: { name: true } } } } },
  });

  return serializeMySlot(updated);
}

// ---------------------------------------------------------------------------
// deleteSlot
// ---------------------------------------------------------------------------

export async function deleteSlot(interviewerId: number, id: number): Promise<void> {
  const existing = await prisma.timeSlot.findFirst({
    where: { id },
  });

  if (!existing || existing.interviewerId !== interviewerId) {
    throw new HttpError(404, 'NOT_FOUND', `Time slot ${id} not found`);
  }

  if (existing.candidateId !== null) {
    throw new HttpError(409, 'ALREADY_BOOKED', 'Cannot delete a booked time slot');
  }

  await prisma.timeSlot.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// listAvailableSlots
// ---------------------------------------------------------------------------

export async function listAvailableSlots(positionId?: number): Promise<AvailableSlot[]> {
  const today = todayUtc();
  const windowEnd = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // If positionId given, restrict to interviewers assigned to that position.
  let interviewerIdFilter: { in: number[] } | undefined;
  if (positionId !== undefined) {
    const assignments = await prisma.positionInterviewer.findMany({
      where: { positionId },
      select: { userId: true },
    });
    interviewerIdFilter = { in: assignments.map((a) => a.userId) };
  }

  const slots = await prisma.timeSlot.findMany({
    where: {
      candidateId: null,
      date: {
        gte: today,
        lte: windowEnd,
      },
      ...(interviewerIdFilter !== undefined
        ? { interviewerId: interviewerIdFilter }
        : {}),
    },
    include: {
      interviewer: { select: { id: true, name: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  return slots.map(serializeAvailableSlot);
}
