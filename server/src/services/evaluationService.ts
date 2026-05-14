import { CandidateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';
import { changeStatus } from './statusService.js';

export async function createEvaluation(
  interviewerId: number,
  candidateId: number,
  input: { result: 'passed' | 'failed'; comment?: string },
) {
  // 1. Candidate exists
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  // 2. Interviewer is assigned to the candidate's position
  const assignment = await prisma.positionInterviewer.findUnique({
    where: { positionId_userId: { positionId: candidate.positionId, userId: interviewerId } },
  });
  if (!assignment) {
    throw new HttpError(403, 'NOT_ASSIGNED', 'Interviewer is not assigned to this position');
  }

  // 3. Candidate has a submitted OA submission
  const submission = await prisma.oaSubmission.findUnique({ where: { candidateId } });
  if (!submission || submission.submittedAt === null) {
    throw new HttpError(400, 'OA_NOT_SUBMITTED', 'Candidate has not submitted the OA');
  }

  if (
    candidate.status !== CandidateStatus.date_confirmed &&
    candidate.status !== CandidateStatus.human_completed
  ) {
    throw new HttpError(
      400,
      'INVALID_TRANSITION',
      'Interview evaluation requires candidate to be in date_confirmed or human_completed status',
      { from: candidate.status },
    );
  }

  const evaluation = await prisma.evaluation.create({
    data: { candidateId, interviewerId, result: input.result, comment: input.comment ?? null },
  });

  const finalStatus = input.result === 'passed' ? CandidateStatus.passed : CandidateStatus.rejected;
  const note = input.comment?.trim()
    ? `Interview evaluation: ${input.comment.trim()}`
    : 'Interview evaluation submitted';

  // Interview evaluation is the interviewer-owned decision point for final outcome.
  if (candidate.status === CandidateStatus.date_confirmed) {
    await changeStatus(candidateId, CandidateStatus.human_completed, interviewerId, 'Interview completed');
  }
  await changeStatus(candidateId, finalStatus, interviewerId, note);

  return evaluation;
}

export async function listEvaluations(candidateId: number) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      result: true,
      comment: true,
      createdAt: true,
      interviewer: {
        select: { id: true, name: true },
      },
    },
  });

  return evaluations;
}

export async function getOaAnswers(candidateId: number) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      oaSubmission: {
        include: {
          answers: {
            include: {
              question: true,
            },
          },
        },
      },
      position: {
        include: {
          oaForm: true,
        },
      },
    },
  });

  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  if (!candidate.oaSubmission || candidate.oaSubmission.submittedAt === null) {
    throw new HttpError(404, 'NO_OA_SUBMISSION', 'No submitted OA for this candidate');
  }

  const { oaSubmission } = candidate;
  const timeLimitMinutes = candidate.position.oaForm?.timeLimitMinutes ?? null;

  const answers = oaSubmission.answers.map((ans) => ({
    questionId: ans.questionId,
    sortOrder: ans.question.sortOrder,
    questionText: ans.question.questionText,
    answerType: ans.question.answerType,
    answerContent: ans.answerContent,
  }));

  return {
    submission: {
      startedAt: oaSubmission.startedAt,
      submittedAt: oaSubmission.submittedAt,
      autoSubmitted: oaSubmission.autoSubmitted,
    },
    answers,
    timeLimitMinutes,
  };
}
