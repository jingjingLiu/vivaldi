import { CandidateStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';
import { getSettings } from './settingService.js';
import { logger } from '../lib/logger.js';
import { dispatchNotification, type TriggerEvent } from './notificationService.js';

// ---------------------------------------------------------------------------
// State machine definition
// ---------------------------------------------------------------------------

export const ALLOWED_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  [CandidateStatus.new]: [CandidateStatus.waiting_for_oa, CandidateStatus.rejected],
  [CandidateStatus.waiting_for_oa]: [
    CandidateStatus.oa_completed,
    CandidateStatus.oa_no_response,
  ],
  [CandidateStatus.oa_completed]: [
    CandidateStatus.wait_to_confirm_date,
    CandidateStatus.oa_failed,
  ],
  [CandidateStatus.wait_to_confirm_date]: [
    CandidateStatus.date_confirmed,
    CandidateStatus.give_up_for_human,
  ],
  [CandidateStatus.date_confirmed]: [
    CandidateStatus.human_completed,
    CandidateStatus.give_up_for_human,
  ],
  [CandidateStatus.human_completed]: [
    CandidateStatus.passed,
    CandidateStatus.rejected,
  ],
  // Terminal states — no outgoing transitions
  [CandidateStatus.passed]: [],
  [CandidateStatus.oa_failed]: [],
  [CandidateStatus.oa_no_response]: [],
  [CandidateStatus.give_up_for_human]: [],
  [CandidateStatus.rejected]: [],
};

export const TERMINAL_STATUSES: CandidateStatus[] = [
  CandidateStatus.passed,
  CandidateStatus.oa_failed,
  CandidateStatus.oa_no_response,
  CandidateStatus.give_up_for_human,
  CandidateStatus.rejected,
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isTransitionAllowed(from: CandidateStatus, to: CandidateStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusHistoryRow {
  fromStatus: CandidateStatus | null;
  toStatus: CandidateStatus;
  operatorId: number | null;
  operatorName: string | null;
  note: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// changeStatus
// ---------------------------------------------------------------------------

export async function changeStatus(
  candidateId: number,
  toStatus: CandidateStatus,
  operatorId: number | null,
  note?: string,
): Promise<import('@prisma/client').Candidate> {
  // Load current candidate
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  const fromStatus = candidate.status;

  // Guard: terminal status
  if (TERMINAL_STATUSES.includes(fromStatus)) {
    throw new HttpError(
      400,
      'TERMINAL_STATUS',
      `Candidate is in terminal status "${fromStatus}" and cannot be transitioned`,
      { from: fromStatus },
    );
  }

  // Guard: allowed transition
  if (!isTransitionAllowed(fromStatus, toStatus)) {
    throw new HttpError(
      400,
      'INVALID_TRANSITION',
      `Transition from "${fromStatus}" to "${toStatus}" is not allowed`,
      { from: fromStatus, to: toStatus },
    );
  }

  // Calculate oa_deadline side effect
  let oaDeadline: Date | undefined;
  if (fromStatus === CandidateStatus.new && toStatus === CandidateStatus.waiting_for_oa) {
    const settings = await getSettings();
    const days = settings.oaDeadlineDays > 0 ? settings.oaDeadlineDays : 7;
    oaDeadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  // Transaction: update candidate + insert history
  const updateData: Prisma.CandidateUpdateInput = { status: toStatus };
  if (oaDeadline !== undefined) {
    updateData.oaDeadline = oaDeadline;
  }

  const [updatedCandidate] = await prisma.$transaction([
    prisma.candidate.update({
      where: { id: candidateId },
      data: updateData,
    }),
    prisma.statusHistory.create({
      data: {
        candidateId,
        fromStatus,
        toStatus,
        operatorId,
        note: note ?? null,
      },
    }),
  ]);

  // ---------------------------------------------------------------------------
  // Fire notifications asynchronously after successful status change.
  // Failures must NOT roll back the status change — log the failure only.
  // ---------------------------------------------------------------------------

  const triggerEvent = resolveNotificationTrigger(fromStatus, toStatus);
  if (triggerEvent) {
    dispatchNotification({ candidateId, triggerEvent }).catch((err) => {
      logger.error({ err, candidateId, triggerEvent }, 'notification dispatch failed');
    });
  }

  return updatedCandidate;
}

// ---------------------------------------------------------------------------
// resolveNotificationTrigger — map transitions to trigger events
// ---------------------------------------------------------------------------

function resolveNotificationTrigger(
  from: CandidateStatus,
  to: CandidateStatus,
): TriggerEvent | null {
  if (from === CandidateStatus.new && to === CandidateStatus.waiting_for_oa) {
    return 'new_to_oa';
  }
  if (from === CandidateStatus.oa_completed && to === CandidateStatus.wait_to_confirm_date) {
    return 'oa_to_human';
  }
  if (from === CandidateStatus.wait_to_confirm_date && to === CandidateStatus.date_confirmed) {
    return 'date_confirmed';
  }
  if (TERMINAL_STATUSES.includes(to)) {
    return 'terminal_status';
  }
  return null;
}

// ---------------------------------------------------------------------------
// listStatusHistory
// ---------------------------------------------------------------------------

export async function listStatusHistory(candidateId: number): Promise<StatusHistoryRow[]> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  const rows = await prisma.statusHistory.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    select: {
      fromStatus: true,
      toStatus: true,
      operatorId: true,
      note: true,
      createdAt: true,
      operator: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    operatorId: r.operatorId,
    operatorName: r.operator?.name ?? null,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
