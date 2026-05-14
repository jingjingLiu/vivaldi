import { CandidateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../errors/HttpError.js';
import { changeStatus } from './statusService.js';
import { notifyOaCompleted } from './userNotificationService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OaState = 'not_started' | 'in_progress' | 'submitted';

export interface OaStateResult {
  state: OaState;
  instructions: { en: string | null; zhCN: string | null };
  timeLimitMinutes: number;
  questionCount: number;
  startedAt?: Date;
  remainingSeconds?: number;
}

export interface StartOaResult {
  startedAt: Date;
  remainingSeconds: number;
}

export interface QuestionWithAnswer {
  id: number;
  sortOrder: number;
  questionText: string;
  answerType: 'text' | 'code';
  answerContent: string | null;
}

export interface SubmitOaResult {
  submittedAt: Date;
  autoSubmitted: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getCandidateWithPosition(candidateId: number) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, positionId: true, status: true },
  });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }
  return candidate;
}

async function getFormForCandidate(positionId: number) {
  const form = await prisma.oaForm.findUnique({
    where: { positionId },
    include: {
      questions: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!form) {
    throw new HttpError(400, 'NO_OA_FORM', 'No OA form exists for this position');
  }
  return form;
}

function computeRemainingSeconds(startedAt: Date, timeLimitMinutes: number): number {
  const elapsedMs = Date.now() - startedAt.getTime();
  const limitMs = timeLimitMinutes * 60 * 1000;
  return Math.max(0, Math.floor((limitMs - elapsedMs) / 1000));
}

function isExpired(startedAt: Date, timeLimitMinutes: number): boolean {
  return Date.now() > startedAt.getTime() + timeLimitMinutes * 60 * 1000;
}

// ---------------------------------------------------------------------------
// checkAndMaybeAutoSubmit
// ---------------------------------------------------------------------------

/**
 * Checks if time has expired but submission hasn't been recorded.
 * If so, auto-submits the OA and transitions candidate status.
 * Returns { expired: true } if the session was (or just became) expired,
 * { expired: false } otherwise.
 */
export async function checkAndMaybeAutoSubmit(
  candidateId: number,
): Promise<{ expired: boolean }> {
  const submission = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { id: true, startedAt: true, submittedAt: true, autoSubmitted: true },
  });

  // No submission at all — not started, cannot be expired
  if (!submission || !submission.startedAt) {
    return { expired: false };
  }

  // Already submitted (manually or auto)
  if (submission.submittedAt !== null) {
    return { expired: false };
  }

  // Get the form to know the time limit
  const candidate = await getCandidateWithPosition(candidateId);
  const form = await getFormForCandidate(candidate.positionId);

  if (!isExpired(submission.startedAt, form.timeLimitMinutes)) {
    return { expired: false };
  }

  // Trigger auto-submit
  await performSubmit(candidateId, submission.id, true);

  return { expired: true };
}

// ---------------------------------------------------------------------------
// performSubmit — shared logic for manual and auto submit
// ---------------------------------------------------------------------------

async function performSubmit(
  candidateId: number,
  submissionId: number,
  auto: boolean,
): Promise<SubmitOaResult> {
  const now = new Date();

  await prisma.oaSubmission.update({
    where: { id: submissionId },
    data: { submittedAt: now, autoSubmitted: auto },
  });

  // Transition candidate status waiting_for_oa → oa_completed
  await changeStatus(candidateId, CandidateStatus.oa_completed, null);
  // Internal staff do not have email/phone fields, so OA review work is surfaced as station messages.
  await notifyOaCompleted(candidateId).catch((err) => {
    logger.error({ err, candidateId }, 'user notification dispatch failed for OA completion');
  });

  return { submittedAt: now, autoSubmitted: auto };
}

// ---------------------------------------------------------------------------
// getOaState
// ---------------------------------------------------------------------------

export async function getOaState(candidateId: number): Promise<OaStateResult> {
  const candidate = await getCandidateWithPosition(candidateId);
  const form = await getFormForCandidate(candidate.positionId);

  const submission = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { startedAt: true, submittedAt: true },
  });

  const instructions = {
    en: form.instructionEn,
    zhCN: form.instructionZh,
  };

  // Determine state
  if (!submission || !submission.startedAt) {
    return {
      state: 'not_started',
      instructions,
      timeLimitMinutes: form.timeLimitMinutes,
      questionCount: form.questions.length,
    };
  }

  if (submission.submittedAt !== null) {
    return {
      state: 'submitted',
      instructions,
      timeLimitMinutes: form.timeLimitMinutes,
      questionCount: form.questions.length,
      startedAt: submission.startedAt,
    };
  }

  // Check if actually expired (but not yet auto-submitted via a request)
  if (isExpired(submission.startedAt, form.timeLimitMinutes)) {
    return {
      state: 'submitted',
      instructions,
      timeLimitMinutes: form.timeLimitMinutes,
      questionCount: form.questions.length,
      startedAt: submission.startedAt,
      remainingSeconds: 0,
    };
  }

  const remainingSeconds = computeRemainingSeconds(submission.startedAt, form.timeLimitMinutes);

  return {
    state: 'in_progress',
    instructions,
    timeLimitMinutes: form.timeLimitMinutes,
    questionCount: form.questions.length,
    startedAt: submission.startedAt,
    remainingSeconds,
  };
}

// ---------------------------------------------------------------------------
// startOa
// ---------------------------------------------------------------------------

export async function startOa(candidateId: number): Promise<StartOaResult> {
  const candidate = await getCandidateWithPosition(candidateId);

  // Status guard
  if (candidate.status !== CandidateStatus.waiting_for_oa) {
    throw new HttpError(403, 'WRONG_STATE', 'Candidate is not in waiting_for_oa status');
  }

  const form = await getFormForCandidate(candidate.positionId);

  // Check existing submission
  const existing = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { startedAt: true, submittedAt: true },
  });

  if (existing?.submittedAt !== null && existing?.submittedAt !== undefined) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'OA has already been submitted');
  }

  if (existing?.startedAt !== null && existing?.startedAt !== undefined) {
    // Already started — check expiry
    if (isExpired(existing.startedAt, form.timeLimitMinutes)) {
      throw new HttpError(410, 'TIME_EXPIRED', 'OA time has expired');
    }
    // Idempotent re-entry
    const remainingSeconds = computeRemainingSeconds(existing.startedAt, form.timeLimitMinutes);
    return { startedAt: existing.startedAt, remainingSeconds };
  }

  // First start — upsert submission with startedAt
  const now = new Date();
  await prisma.oaSubmission.upsert({
    where: { candidateId },
    create: { candidateId, startedAt: now },
    update: { startedAt: now },
  });

  const remainingSeconds = computeRemainingSeconds(now, form.timeLimitMinutes);
  return { startedAt: now, remainingSeconds };
}

// ---------------------------------------------------------------------------
// getQuestionsForCandidate
// ---------------------------------------------------------------------------

export async function getQuestionsForCandidate(
  candidateId: number,
): Promise<{ questions: QuestionWithAnswer[] }> {
  const candidate = await getCandidateWithPosition(candidateId);

  const submission = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { id: true, startedAt: true, submittedAt: true },
  });

  // Check submission state before status guard
  if (submission?.submittedAt !== null && submission?.submittedAt !== undefined) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'OA has already been submitted');
  }

  // Status guard
  if (candidate.status !== CandidateStatus.waiting_for_oa) {
    throw new HttpError(403, 'WRONG_STATE', 'Candidate is not in waiting_for_oa status');
  }

  if (!submission || !submission.startedAt) {
    throw new HttpError(403, 'NOT_STARTED', 'OA has not been started yet');
  }

  // Auto-submit check
  const { expired } = await checkAndMaybeAutoSubmit(candidateId);
  if (expired) {
    throw new HttpError(410, 'TIME_EXPIRED', 'OA time has expired; submission recorded');
  }

  const form = await getFormForCandidate(candidate.positionId);

  // Fetch saved answers for this submission
  const answers = await prisma.oaAnswer.findMany({
    where: { submissionId: submission.id },
    select: { questionId: true, answerContent: true },
  });
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answerContent]));

  const questions: QuestionWithAnswer[] = form.questions.map((q) => ({
    id: q.id,
    sortOrder: q.sortOrder,
    questionText: q.questionText,
    answerType: q.answerType as 'text' | 'code',
    answerContent: answerMap.get(q.id) ?? null,
  }));

  return { questions };
}

// ---------------------------------------------------------------------------
// saveAnswer
// ---------------------------------------------------------------------------

export async function saveAnswer(
  candidateId: number,
  questionId: number,
  answerContent: string,
): Promise<{ updatedAt: Date }> {
  const candidate = await getCandidateWithPosition(candidateId);

  const submission = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { id: true, startedAt: true, submittedAt: true },
  });

  // Check submission state before status guard
  if (submission?.submittedAt !== null && submission?.submittedAt !== undefined) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'OA has already been submitted');
  }

  // Status guard
  if (candidate.status !== CandidateStatus.waiting_for_oa) {
    throw new HttpError(403, 'WRONG_STATE', 'Candidate is not in waiting_for_oa status');
  }

  if (!submission || !submission.startedAt) {
    throw new HttpError(403, 'NOT_STARTED', 'OA has not been started yet');
  }

  // Auto-submit check
  const { expired } = await checkAndMaybeAutoSubmit(candidateId);
  if (expired) {
    throw new HttpError(410, 'TIME_EXPIRED', 'OA time has expired; submission recorded');
  }

  // Validate questionId belongs to the form for this candidate
  const form = await getFormForCandidate(candidate.positionId);
  const validQuestion = form.questions.find((q) => q.id === questionId);
  if (!validQuestion) {
    throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question ${questionId} not found in this OA form`);
  }

  // Upsert answer
  const answer = await prisma.oaAnswer.upsert({
    where: { submissionId_questionId: { submissionId: submission.id, questionId } },
    create: { submissionId: submission.id, questionId, answerContent },
    update: { answerContent },
  });

  return { updatedAt: answer.updatedAt };
}

// ---------------------------------------------------------------------------
// submitOa
// ---------------------------------------------------------------------------

export async function submitOa(
  candidateId: number,
  auto = false,
): Promise<SubmitOaResult> {
  const candidate = await getCandidateWithPosition(candidateId);

  // Check submission state first (before status guard) so re-submit gives ALREADY_SUBMITTED
  const submission = await prisma.oaSubmission.findUnique({
    where: { candidateId },
    select: { id: true, startedAt: true, submittedAt: true },
  });

  if (submission?.submittedAt !== null && submission?.submittedAt !== undefined) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'OA has already been submitted');
  }

  // Status guard
  if (candidate.status !== CandidateStatus.waiting_for_oa) {
    throw new HttpError(403, 'WRONG_STATE', 'Candidate is not in waiting_for_oa status');
  }

  if (!submission || !submission.startedAt) {
    throw new HttpError(403, 'NOT_STARTED', 'OA has not been started yet');
  }

  // Check if time expired — if so, force auto=true
  const form = await getFormForCandidate(candidate.positionId);
  const expired = isExpired(submission.startedAt, form.timeLimitMinutes);
  const isAuto = auto || expired;

  return performSubmit(candidateId, submission.id, isAuto);
}
