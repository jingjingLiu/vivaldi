import { Prisma, CandidateStatus, Gender } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';
import { generateOneTimeCode } from '../lib/otp.js';
import { deleteUpload, saveUpload } from '../lib/fileStorage.js';
import type { ResumeConverter } from './resumeConverter.js';
import type { ResumeExtractor } from './resumeExtractor.js';
import { LocalResumeConverter } from './resumeConverter.js';
import { LocalResumeExtractor } from './resumeExtractor.js';

// ---------------------------------------------------------------------------
// Serialization types
// ---------------------------------------------------------------------------

export interface ResumeFileMeta {
  id: number;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

export interface CandidateSummary {
  id: number;
  name: string | null;
  email: string | null;
  phoneMasked: string | null;
  positionId: number;
  positionName: string;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusHistoryEntry {
  fromStatus: CandidateStatus | null;
  toStatus: CandidateStatus;
  operatorId: number | null;
  operatorName: string | null;
  note: string | null;
  createdAt: Date;
}

export interface CandidateDetail extends CandidateSummary {
  gender: Gender | null;
  phone: string | null;
  resumeMarkdown: string | null;
  oaDeadline: Date | null;
  oneTimeCode: string;
  resumeFile: ResumeFileMeta | null;
  statusHistory: StatusHistoryEntry[];
  viewerCanEvaluate: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 4) return '***';
  return `***${phone.slice(-4)}`;
}

function serializeSummary(c: {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  positionId: number;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
  position: { name: string };
}): CandidateSummary {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phoneMasked: maskPhone(c.phone),
    positionId: c.positionId,
    positionName: c.position.name,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function serializeDetail(
  c: {
    id: number;
    name: string | null;
    gender: Gender | null;
    email: string | null;
    phone: string | null;
    positionId: number;
    status: CandidateStatus;
    oneTimeCode: string;
    oaDeadline: Date | null;
    resumeMarkdown: string | null;
    createdAt: Date;
    updatedAt: Date;
    position: { name: string };
    resumeFile: {
      id: number;
      originalFilename: string;
      mimeType: string;
      fileSize: number;
      createdAt: Date;
    } | null;
    statusHistories: {
      fromStatus: CandidateStatus | null;
      toStatus: CandidateStatus;
      operatorId: number | null;
      note: string | null;
      createdAt: Date;
      operator: { name: string } | null;
    }[];
  },
  viewerCanEvaluate: boolean,
): CandidateDetail {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phoneMasked: maskPhone(c.phone),
    positionId: c.positionId,
    positionName: c.position.name,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    gender: c.gender,
    phone: c.phone,
    resumeMarkdown: c.resumeMarkdown,
    oaDeadline: c.oaDeadline,
    oneTimeCode: c.oneTimeCode,
    resumeFile: c.resumeFile
      ? {
          id: c.resumeFile.id,
          originalFilename: c.resumeFile.originalFilename,
          mimeType: c.resumeFile.mimeType,
          fileSize: c.resumeFile.fileSize,
          createdAt: c.resumeFile.createdAt,
        }
      : null,
    statusHistory: c.statusHistories.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      operatorId: h.operatorId,
      operatorName: h.operator?.name ?? null,
      note: h.note,
      createdAt: h.createdAt,
    })),
    viewerCanEvaluate,
  };
}

// ---------------------------------------------------------------------------
// Prisma includes
// ---------------------------------------------------------------------------

const summaryInclude = {
  position: { select: { name: true } },
} satisfies Prisma.CandidateInclude;

const detailInclude = {
  position: { select: { name: true } },
  resumeFile: {
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
    },
  },
  statusHistories: {
    select: {
      fromStatus: true,
      toStatus: true,
      operatorId: true,
      note: true,
      createdAt: true,
      operator: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
} satisfies Prisma.CandidateInclude;

// ---------------------------------------------------------------------------
// One-time code with retry
// ---------------------------------------------------------------------------

async function generateUniqueOneTimeCode(maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = generateOneTimeCode();
    const existing = await prisma.candidate.findUnique({ where: { oneTimeCode: code } });
    if (!existing) return code;
  }
  throw new HttpError(500, 'ONE_TIME_CODE_COLLISION', 'Failed to generate a unique one-time code after multiple retries');
}

// ---------------------------------------------------------------------------
// Upload Resume
// ---------------------------------------------------------------------------

export interface UploadResumeInput {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  positionId: number;
  converter?: ResumeConverter;
  extractor?: ResumeExtractor;
}

export interface UploadResumeResult {
  candidate: CandidateSummary;
  resumeFile: { id: number; originalFilename: string };
}

export async function uploadResume(input: UploadResumeInput): Promise<UploadResumeResult> {
  const converter = input.converter ?? new LocalResumeConverter();
  const extractor = input.extractor ?? new LocalResumeExtractor();

  // Verify position exists
  const position = await prisma.position.findUnique({ where: { id: input.positionId } });
  if (!position) {
    throw new HttpError(404, 'POSITION_NOT_FOUND', `Position ${input.positionId} not found`);
  }

  // Save file to disk
  const { storedFilename, storedPath } = await saveUpload(input.buffer, input.originalFilename, input.mimeType);

  // Generate unique one-time code
  const oneTimeCode = await generateUniqueOneTimeCode();

  let markdown: string;
  let extracted: Awaited<ReturnType<ResumeExtractor['extract']>>;
  try {
    // Parse the saved original file before creating DB rows, so failed uploads do not create candidates.
    markdown = await converter.convert({
      storedPath,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    });
    extracted = await extractor.extract(markdown);
  } catch (error) {
    await deleteUpload(storedFilename);
    throw error;
  }

  // Create candidate + resumeFile in a transaction
  const candidate = await prisma.candidate.create({
    data: {
      positionId: input.positionId,
      status: 'new',
      oneTimeCode,
      resumeMarkdown: markdown,
      name: extracted.name ?? null,
      gender: extracted.gender ?? null,
      email: extracted.email ?? null,
      phone: extracted.phone ?? null,
      resumeFile: {
        create: {
          originalFilename: input.originalFilename,
          storedFilename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
        },
      },
    },
    include: {
      ...summaryInclude,
      resumeFile: { select: { id: true, originalFilename: true } },
    },
  });

  return {
    candidate: serializeSummary(candidate),
    resumeFile: {
      id: candidate.resumeFile!.id,
      originalFilename: candidate.resumeFile!.originalFilename,
    },
  };
}

// ---------------------------------------------------------------------------
// List Candidates
// ---------------------------------------------------------------------------

export interface ListCandidatesOptions {
  q?: string;
  status?: CandidateStatus;
  positionId?: number;
  page?: number;
  pageSize?: number;
}

export interface ListCandidatesResult {
  items: CandidateSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCandidates(opts: ListCandidatesOptions): Promise<ListCandidatesResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CandidateWhereInput = {};

  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q } },
      { email: { contains: opts.q } },
      { phone: { contains: opts.q } },
    ];
  }

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.positionId) {
    where.positionId = opts.positionId;
  }

  const [candidates, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      include: summaryInclude,
      skip,
      take: pageSize,
      orderBy: { id: 'desc' },
    }),
    prisma.candidate.count({ where }),
  ]);

  return {
    items: candidates.map(serializeSummary),
    total,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Get Candidate by ID
// ---------------------------------------------------------------------------

export async function getCandidateById(
  id: number,
  viewer?: { userId: number; roles: string[] },
): Promise<CandidateDetail> {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: detailInclude,
  });

  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${id} not found`);
  }

  let viewerCanEvaluate = false;
  if (viewer && viewer.roles.includes('interviewer')) {
    const assignment = await prisma.positionInterviewer.findUnique({
      where: { positionId_userId: { positionId: candidate.positionId, userId: viewer.userId } },
    });
    viewerCanEvaluate = assignment !== null;
  }

  return serializeDetail(candidate, viewerCanEvaluate);
}

// ---------------------------------------------------------------------------
// Update Candidate Info
// ---------------------------------------------------------------------------

export interface UpdateCandidateInfoInput {
  name?: string;
  gender?: Gender;
  email?: string;
  phone?: string;
  resumeMarkdown?: string;
}

export async function updateCandidateInfo(
  id: number,
  input: UpdateCandidateInfoInput,
): Promise<CandidateDetail> {
  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${id} not found`);
  }

  const updateData: Prisma.CandidateUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.gender !== undefined) updateData.gender = input.gender;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.resumeMarkdown !== undefined) updateData.resumeMarkdown = input.resumeMarkdown;

  const candidate = await prisma.candidate.update({
    where: { id },
    data: updateData,
    include: detailInclude,
  });

  // Candidate edits are restricted to coordinator/screener routes, so this response
  // should not expose interviewer-only evaluation capability.
  return serializeDetail(candidate, false);
}

// ---------------------------------------------------------------------------
// Delete Candidate
// ---------------------------------------------------------------------------

export async function deleteCandidate(id: number): Promise<void> {
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true,
      resumeFile: { select: { storedFilename: true } },
    },
  });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${id} not found`);
  }

  await prisma.$transaction([
    // Booked slots keep a nullable reference to candidate, so clear it before deleting.
    prisma.timeSlot.updateMany({
      where: { candidateId: id },
      data: { candidateId: null },
    }),
    prisma.candidate.delete({ where: { id } }),
  ]);

  if (existing.resumeFile) {
    await deleteUpload(existing.resumeFile.storedFilename);
  }
}

// ---------------------------------------------------------------------------
// Get Resume File Meta
// ---------------------------------------------------------------------------

export async function getResumeFileMeta(candidateId: number): Promise<{
  storedFilename: string;
  originalFilename: string;
  mimeType: string;
}> {
  const resumeFile = await prisma.resumeFile.findUnique({ where: { candidateId } });
  if (!resumeFile) {
    throw new HttpError(404, 'NOT_FOUND', `No resume file for candidate ${candidateId}`);
  }
  return {
    storedFilename: resumeFile.storedFilename,
    originalFilename: resumeFile.originalFilename,
    mimeType: resumeFile.mimeType,
  };
}
