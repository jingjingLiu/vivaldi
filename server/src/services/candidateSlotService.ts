import { CandidateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../errors/HttpError.js';
import { listAvailableSlots, type AvailableSlot } from './timeSlotService.js';
import { notifyInterviewBooked } from './userNotificationService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookedSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  interviewer: { id: number; name: string };
}

export interface ListAvailableResult {
  slots: AvailableSlot[];
  state: CandidateStatus;
}

export interface BookSlotResult {
  slot: BookedSlot;
  candidateStatus: CandidateStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 28;

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const da = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatTime(d: Date): string {
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ---------------------------------------------------------------------------
// listAvailableForCandidate
// ---------------------------------------------------------------------------

export async function listAvailableForCandidate(
  candidateId: number,
): Promise<ListAvailableResult> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  const state = candidate.status;

  if (state !== CandidateStatus.wait_to_confirm_date) {
    return { slots: [], state };
  }

  const slots = await listAvailableSlots(candidate.positionId ?? undefined);
  return { slots, state };
}

// ---------------------------------------------------------------------------
// bookSlot
// ---------------------------------------------------------------------------

export async function bookSlot(
  candidateId: number,
  slotId: number,
): Promise<BookSlotResult> {
  // 1. Load candidate
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  // 2. Status guard
  if (candidate.status !== CandidateStatus.wait_to_confirm_date) {
    throw new HttpError(403, 'WRONG_STATE', 'Candidate must be in wait_to_confirm_date status to book a slot');
  }

  // 3. Check candidate doesn't already have a booked slot
  const existingBooking = await prisma.timeSlot.findFirst({
    where: { candidateId },
  });
  if (existingBooking) {
    throw new HttpError(409, 'ALREADY_BOOKED_OWN', 'Candidate already has a booked slot');
  }

  // 4. Load and validate the slot
  const slot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    include: { interviewer: { select: { id: true, name: true } } },
  });
  if (!slot) {
    throw new HttpError(404, 'SLOT_NOT_FOUND', `Time slot ${slotId} not found`);
  }

  // 4a. Window check
  const today = todayUtc();
  const windowEnd = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (slot.date < today || slot.date > windowEnd) {
    throw new HttpError(400, 'SLOT_OUT_OF_WINDOW', 'Slot date is outside the valid booking window');
  }

  // 4b. Position check — interviewer must be assigned to candidate's position
  if (candidate.positionId === null) {
    throw new HttpError(400, 'SLOT_WRONG_POSITION', 'Candidate has no assigned position');
  }
  const assignment = await prisma.positionInterviewer.findFirst({
    where: { positionId: candidate.positionId, userId: slot.interviewerId },
  });
  if (!assignment) {
    throw new HttpError(400, 'SLOT_WRONG_POSITION', 'Slot interviewer is not assigned to the candidate\'s position');
  }

  // 5. Transaction: conditional update to claim slot + status transition
  let updatedCandidate: { status: CandidateStatus };

  await prisma.$transaction(async (tx) => {
    // 5a. Conditional update (claim only if still unbooked)
    const result = await tx.timeSlot.updateMany({
      where: { id: slotId, candidateId: null },
      data: { candidateId },
    });

    // 5b. If count === 0, slot was just taken
    if (result.count === 0) {
      throw new HttpError(409, 'SLOT_TAKEN', 'This slot has just been booked by another candidate');
    }

    // 5c. Status transition
    updatedCandidate = await tx.candidate.update({
      where: { id: candidateId },
      data: { status: CandidateStatus.date_confirmed },
    });

    await tx.statusHistory.create({
      data: {
        candidateId,
        fromStatus: CandidateStatus.wait_to_confirm_date,
        toStatus: CandidateStatus.date_confirmed,
        operatorId: null,
        note: 'Candidate booked slot',
      },
    });
  });

  // Re-fetch slot with interviewer for return value
  const bookedSlot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    include: { interviewer: { select: { id: true, name: true } } },
  });

  const slotDate = formatDate(bookedSlot!.date);
  const slotTime = `${formatTime(bookedSlot!.startTime)}-${formatTime(bookedSlot!.endTime)}`;
  // The booked interviewer and coordinators need an in-system reminder to continue the workflow.
  await notifyInterviewBooked({
    candidateId,
    interviewerId: bookedSlot!.interviewer.id,
    slotDate,
    slotTime,
  }).catch((err) => {
    logger.error({ err, candidateId, slotId }, 'user notification dispatch failed for interview booking');
  });

  return {
    slot: {
      id: bookedSlot!.id,
      date: slotDate,
      startTime: formatTime(bookedSlot!.startTime),
      endTime: formatTime(bookedSlot!.endTime),
      interviewer: { id: bookedSlot!.interviewer.id, name: bookedSlot!.interviewer.name },
    },
    candidateStatus: CandidateStatus.date_confirmed,
  };
}

// ---------------------------------------------------------------------------
// getOwnBooking
// ---------------------------------------------------------------------------

export async function getOwnBooking(candidateId: number): Promise<BookedSlot | null> {
  const slot = await prisma.timeSlot.findFirst({
    where: { candidateId },
    include: { interviewer: { select: { id: true, name: true } } },
  });

  if (!slot) return null;

  return {
    id: slot.id,
    date: formatDate(slot.date),
    startTime: formatTime(slot.startTime),
    endTime: formatTime(slot.endTime),
    interviewer: { id: slot.interviewer.id, name: slot.interviewer.name },
  };
}
