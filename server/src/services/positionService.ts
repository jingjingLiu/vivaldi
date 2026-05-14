import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';

// ---------------------------------------------------------------------------
// Serialization types
// ---------------------------------------------------------------------------

export interface PositionSummary {
  id: number;
  name: string;
  candidateCount: number;
  hasOaForm: boolean;
  interviewerCount: number;
  createdAt: Date;
}

export interface PositionInterviewerInfo {
  id: number;
  username: string;
  name: string;
}

export interface PositionDetail {
  id: number;
  name: string;
  candidateCount: number;
  hasOaForm: boolean;
  interviewers: PositionInterviewerInfo[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Internal Prisma result types
// ---------------------------------------------------------------------------

type PositionWithDetail = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { candidates: number };
  oaForm: { id: number } | null;
  interviewers: {
    user: { id: number; username: string; name: string };
  }[];
};

type PositionWithSummary = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { candidates: number; interviewers: number };
  oaForm: { id: number } | null;
};

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeDetail(pos: PositionWithDetail): PositionDetail {
  return {
    id: pos.id,
    name: pos.name,
    candidateCount: pos._count.candidates,
    hasOaForm: pos.oaForm !== null,
    interviewers: pos.interviewers.map((pi) => ({
      id: pi.user.id,
      username: pi.user.username,
      name: pi.user.name,
    })),
    createdAt: pos.createdAt,
    updatedAt: pos.updatedAt,
  };
}

function serializeSummary(pos: PositionWithSummary): PositionSummary {
  return {
    id: pos.id,
    name: pos.name,
    candidateCount: pos._count.candidates,
    hasOaForm: pos.oaForm !== null,
    interviewerCount: pos._count.interviewers,
    createdAt: pos.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Includes
// ---------------------------------------------------------------------------

const detailInclude = {
  _count: { select: { candidates: true } },
  oaForm: { select: { id: true } },
  interviewers: {
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
  },
} satisfies Prisma.PositionInclude;

const summaryInclude = {
  _count: { select: { candidates: true, interviewers: true } },
  oaForm: { select: { id: true } },
} satisfies Prisma.PositionInclude;

// ---------------------------------------------------------------------------
// Interviewer validation
// ---------------------------------------------------------------------------

async function validateInterviewerIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  const found = await prisma.user.findMany({
    where: {
      id: { in: ids },
      roles: { some: { role: 'interviewer' } },
      enabled: true,
    },
    select: { id: true },
  });

  if (found.length !== ids.length) {
    const foundSet = new Set(found.map((u) => u.id));
    const badIds = ids.filter((id) => !foundSet.has(id));
    throw new HttpError(
      400,
      'INVALID_INTERVIEWER_IDS',
      `The following ids are not valid interviewers: ${badIds.join(', ')}`,
      { invalidIds: badIds },
    );
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListPositionsOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPositionsResult {
  items: PositionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listPositions(opts: ListPositionsOptions): Promise<ListPositionsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.PositionWhereInput = {};
  if (opts.q) {
    where.name = { contains: opts.q };
  }

  const [positions, total] = await Promise.all([
    prisma.position.findMany({
      where,
      include: summaryInclude,
      skip,
      take: pageSize,
      orderBy: { id: 'asc' },
    }),
    prisma.position.count({ where }),
  ]);

  return {
    items: positions.map(serializeSummary),
    total,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------

export async function getPositionById(id: number): Promise<PositionDetail> {
  const position = await prisma.position.findUnique({
    where: { id },
    include: detailInclude,
  });

  if (!position) {
    throw new HttpError(404, 'NOT_FOUND', `Position ${id} not found`);
  }

  return serializeDetail(position);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatePositionInput {
  name: string;
  interviewerIds?: number[];
}

export async function createPosition(input: CreatePositionInput): Promise<PositionDetail> {
  const ids = input.interviewerIds ?? [];
  await validateInterviewerIds(ids);

  const position = await prisma.position.create({
    data: {
      name: input.name,
      interviewers: ids.length > 0
        ? { create: ids.map((userId) => ({ userId })) }
        : undefined,
    },
    include: detailInclude,
  });

  return serializeDetail(position);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdatePositionInput {
  name?: string;
  interviewerIds?: number[];
}

export async function updatePosition(id: number, input: UpdatePositionInput): Promise<PositionDetail> {
  const existing = await prisma.position.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `Position ${id} not found`);
  }

  if (input.interviewerIds !== undefined) {
    await validateInterviewerIds(input.interviewerIds);
  }

  let position: PositionWithDetail;

  if (input.interviewerIds !== undefined) {
    const ids = input.interviewerIds;
    position = await prisma.$transaction(async (tx) => {
      await tx.positionInterviewer.deleteMany({ where: { positionId: id } });
      return tx.position.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          interviewers: ids.length > 0
            ? { create: ids.map((userId) => ({ userId })) }
            : undefined,
        },
        include: detailInclude,
      });
    });
  } else {
    position = await prisma.position.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
      },
      include: detailInclude,
    });
  }

  return serializeDetail(position);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deletePosition(id: number): Promise<void> {
  const position = await prisma.position.findUnique({
    where: { id },
    include: { _count: { select: { candidates: true } } },
  });

  if (!position) {
    throw new HttpError(404, 'NOT_FOUND', `Position ${id} not found`);
  }

  if (position._count.candidates > 0) {
    throw new HttpError(
      409,
      'HAS_CANDIDATES',
      `Position ${id} has ${position._count.candidates} candidate(s) and cannot be deleted`,
    );
  }

  await prisma.position.delete({ where: { id } });
}
