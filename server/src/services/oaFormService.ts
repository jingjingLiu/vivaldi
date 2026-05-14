import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OaQuestionDetail {
  id: number;
  sortOrder: number;
  questionText: string;
  answerType: 'text' | 'code';
}

export interface OaFormDetail {
  id: number;
  positionId: number;
  timeLimitMinutes: number;
  instructionEn: string | null;
  instructionZh: string | null;
  questions: OaQuestionDetail[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertOaFormInput {
  timeLimitMinutes: number;
  instructionEn?: string;
  instructionZh?: string;
  questions: {
    questionText: string;
    answerType: 'text' | 'code';
    sortOrder: number;
  }[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const formInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

type FormWithQuestions = {
  id: number;
  positionId: number;
  timeLimitMinutes: number;
  instructionEn: string | null;
  instructionZh: string | null;
  createdAt: Date;
  updatedAt: Date;
  questions: {
    id: number;
    sortOrder: number;
    questionText: string;
    answerType: string;
  }[];
};

function serializeForm(form: FormWithQuestions): OaFormDetail {
  return {
    id: form.id,
    positionId: form.positionId,
    timeLimitMinutes: form.timeLimitMinutes,
    instructionEn: form.instructionEn,
    instructionZh: form.instructionZh,
    questions: form.questions.map((q) => ({
      id: q.id,
      sortOrder: q.sortOrder,
      questionText: q.questionText,
      answerType: q.answerType as 'text' | 'code',
    })),
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

async function assertPositionExists(positionId: number): Promise<void> {
  const pos = await prisma.position.findUnique({ where: { id: positionId }, select: { id: true } });
  if (!pos) {
    throw new HttpError(404, 'POSITION_NOT_FOUND', `Position ${positionId} not found`);
  }
}

// ---------------------------------------------------------------------------
// getOaFormByPosition
// ---------------------------------------------------------------------------

export async function getOaFormByPosition(positionId: number): Promise<OaFormDetail | null> {
  await assertPositionExists(positionId);

  const form = await prisma.oaForm.findUnique({
    where: { positionId },
    include: formInclude,
  });

  return form ? serializeForm(form) : null;
}

// ---------------------------------------------------------------------------
// upsertOaForm
// ---------------------------------------------------------------------------

export async function upsertOaForm(
  positionId: number,
  input: UpsertOaFormInput,
): Promise<OaFormDetail> {
  await assertPositionExists(positionId);

  const result = await prisma.$transaction(async (tx) => {
    // Upsert the form (preserves createdAt on update)
    const form = await tx.oaForm.upsert({
      where: { positionId },
      create: {
        positionId,
        timeLimitMinutes: input.timeLimitMinutes,
        instructionEn: input.instructionEn ?? null,
        instructionZh: input.instructionZh ?? null,
      },
      update: {
        timeLimitMinutes: input.timeLimitMinutes,
        instructionEn: input.instructionEn ?? null,
        instructionZh: input.instructionZh ?? null,
      },
      select: { id: true, positionId: true, timeLimitMinutes: true, instructionEn: true, instructionZh: true, createdAt: true, updatedAt: true },
    });

    // Delete all existing questions for this form
    await tx.oaQuestion.deleteMany({ where: { formId: form.id } });

    // Create fresh questions
    await tx.oaQuestion.createMany({
      data: input.questions.map((q) => ({
        formId: form.id,
        sortOrder: q.sortOrder,
        questionText: q.questionText,
        answerType: q.answerType,
      })),
    });

    // Fetch newly created questions ordered by sortOrder
    const questions = await tx.oaQuestion.findMany({
      where: { formId: form.id },
      orderBy: { sortOrder: 'asc' },
    });

    return { ...form, questions };
  });

  return serializeForm(result);
}

// ---------------------------------------------------------------------------
// deleteOaForm
// ---------------------------------------------------------------------------

export async function deleteOaForm(positionId: number): Promise<void> {
  await assertPositionExists(positionId);

  const form = await prisma.oaForm.findUnique({
    where: { positionId },
    select: { id: true },
  });

  if (!form) {
    // Nothing to delete — treat as success (idempotent)
    return;
  }

  // Check if any candidate for this position has an OaSubmission
  const submissionCount = await prisma.oaSubmission.count({
    where: {
      candidate: { positionId },
    },
  });

  if (submissionCount > 0) {
    throw new HttpError(
      409,
      'FORM_IN_USE',
      'Cannot delete OA form: candidates have already submitted answers',
    );
  }

  await prisma.oaForm.delete({ where: { positionId } });
}
