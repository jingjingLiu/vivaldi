import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { createCandidatesRouter } from '../src/routes/candidates.js';
import { deleteUpload } from '../src/lib/fileStorage.js';

// Unique suffix to isolate test data
const SUFFIX = `cand_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';

// Users
let coordCookie: string;
let screenerCookie: string;
let interviewerCookie: string;
let interviewerUserId: number;

// Position for tests
let testPositionId: number;

// Track created candidates + stored files for cleanup
const createdCandidateIds: number[] = [];
const createdStoredFilenames: string[] = [];
const createdTimeSlotIds: number[] = [];

const app = createApp();

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

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

// Minimal fake PDF buffer used only for auth/validation paths that do not parse the file.
const SMALL_PDF_BUFFER = Buffer.from('%PDF-1.4 test');
const TEXT_RESUME_BUFFER = Buffer.from(
  ['姓名: 王小明', '性别: 男', '邮箱: wang@example.com', '电话: 138 0013 8000', '5 years backend engineer'].join('\n'),
);

// 11 MB buffer (oversized)
const OVERSIZED_BUFFER = Buffer.alloc(11 * 1024 * 1024, 0);

// -----------------------------------------------------------------------
// Setup / Teardown
// -----------------------------------------------------------------------

beforeAll(async () => {
  // Create coordinator
  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Coordinator Cand Tests',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  // Create screener
  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Screener Cand Tests',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  // Create interviewer
  const interviewer = await prisma.user.create({
    data: {
      username: `interviewer_${SUFFIX}`,
      passwordHash: await hashPassword('Interviewer1!'),
      name: 'Interviewer Cand Tests',
      roles: { create: [{ role: Role.interviewer }] },
    },
  });
  interviewerUserId = interviewer.id;

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');
  interviewerCookie = await loginAs(`interviewer_${SUFFIX}`, 'Interviewer1!');

  // Create a position for tests
  const pos = await prisma.position.create({ data: { name: `Test Position ${SUFFIX}` } });
  testPositionId = pos.id;
});

afterAll(async () => {
  // Delete slots before candidates so optional candidate references never block cleanup.
  if (createdTimeSlotIds.length > 0) {
    await prisma.timeSlot.updateMany({
      where: { id: { in: createdTimeSlotIds } },
      data: { candidateId: null },
    });
    await prisma.timeSlot.deleteMany({ where: { id: { in: createdTimeSlotIds } } });
  }

  // Delete candidates (cascades to resumeFile)
  if (createdCandidateIds.length > 0) {
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }

  // Delete uploaded files from disk
  for (const filename of createdStoredFilenames) {
    await deleteUpload(filename);
  }

  // Delete test position
  if (testPositionId) {
    await prisma.position.deleteMany({ where: { id: testPositionId } });
  }

  // Delete test users
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `interviewer_${SUFFIX}` } } });

  await disconnectPrisma();
});

// -----------------------------------------------------------------------
// POST /candidates/upload-resume
// -----------------------------------------------------------------------

describe('POST /candidates/upload-resume', () => {
  it('[TC-3.3-001] coordinator can upload a TXT resume: 201, creates candidate+resumeFile and extracts basic fields', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [coordCookie])
      .field('positionId', String(testPositionId))
      .attach('file', TEXT_RESUME_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    const { candidate, resumeFile } = res.body as {
      candidate: Record<string, unknown>;
      resumeFile: { id: number; originalFilename: string };
    };

    expect(candidate.status).toBe('new');
    expect(candidate.positionId).toBe(testPositionId);
    expect(candidate.name).toBe('王小明');
    expect(candidate.email).toBe('wang@example.com');
    // phoneMasked not full phone
    expect(candidate.phoneMasked).toBe('***8000');
    expect(candidate).not.toHaveProperty('phone');

    expect(resumeFile.originalFilename).toBe('resume.txt');
    expect(typeof resumeFile.id).toBe('number');

    // Save for cleanup and further tests
    createdCandidateIds.push(candidate.id as number);

    // Verify oneTimeCode via DB
    const dbCandidate = await prisma.candidate.findUnique({ where: { id: candidate.id as number } });
    expect(dbCandidate).not.toBeNull();
    expect(dbCandidate!.oneTimeCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    expect(dbCandidate!.oneTimeCode.length).toBe(8);

    // Verify the uploaded text is now used as parsed resume Markdown.
    expect(dbCandidate!.resumeMarkdown).toContain('王小明');
    expect(dbCandidate!.resumeMarkdown).not.toContain('Resume (stub)');
    expect(dbCandidate!.gender).toBe('male');
    expect(dbCandidate!.phone).toBe('13800138000');

    // Track stored file for cleanup
    const rfDb = await prisma.resumeFile.findUnique({ where: { candidateId: candidate.id as number } });
    if (rfDb) createdStoredFilenames.push(rfDb.storedFilename);
  });

  it('[TC-3.3-002] rejects PNG because image OCR is not supported', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [screenerCookie])
      .field('positionId', String(testPositionId))
      .attach('file', pngBuffer, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('[TC-3.3-009] returns 403 when interviewer tries to upload', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [interviewerCookie])
      .field('positionId', String(testPositionId))
      .attach('file', SMALL_PDF_BUFFER, { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .field('positionId', String(testPositionId))
      .attach('file', SMALL_PDF_BUFFER, { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
  });

  it('[TC-3.3-011] returns 400 INVALID_FILE_TYPE for unsupported MIME', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [coordCookie])
      .field('positionId', String(testPositionId))
      .attach('file', Buffer.from('hello'), { filename: 'test.gif', contentType: 'image/gif' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('[TC-3.3-011] returns 400 FILE_TOO_LARGE for 11 MB file', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [coordCookie])
      .field('positionId', String(testPositionId))
      .attach('file', OVERSIZED_BUFFER, { filename: 'big.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('[TC-3.3-007] returns 404 POSITION_NOT_FOUND for non-existent positionId', async () => {
    const res = await request(app)
      .post('/candidates/upload-resume')
      .set('Cookie', [coordCookie])
      .field('positionId', '999999999')
      .attach('file', SMALL_PDF_BUFFER, { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('POSITION_NOT_FOUND');
  });
});

// -----------------------------------------------------------------------
// GET /candidates
// -----------------------------------------------------------------------

describe('GET /candidates', () => {
  it('[TC-3.1-001] returns paginated list with items, total, page, pageSize', async () => {
    const res = await request(app)
      .get('/candidates')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.page).toBe(1);
    expect(typeof body.pageSize).toBe('number');
  });

  it('[TC-3.1-008] items have phoneMasked not full phone', async () => {
    const res = await request(app)
      .get('/candidates')
      .set('Cookie', [coordCookie]);

    const { items } = res.body as { items: Record<string, unknown>[] };
    for (const item of items) {
      expect(item).not.toHaveProperty('phone');
      expect(item).toHaveProperty('phoneMasked');
    }
  });

  it('[TC-3.1-003] filters by status=new', async () => {
    const res = await request(app)
      .get('/candidates?status=new')
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: { status: string }[] };
    for (const item of items) {
      expect(item.status).toBe('new');
    }
  });

  it('[TC-3.1-004] filters by positionId', async () => {
    const res = await request(app)
      .get(`/candidates?positionId=${testPositionId}`)
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: { positionId: number }[] };
    for (const item of items) {
      expect(item.positionId).toBe(testPositionId);
    }
  });

  it('[TC-3.1-002] filters by q (name/email/phone search)', async () => {
    // Create a candidate with a known name for searching
    const candidateWithName = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: 'new',
        oneTimeCode: `SEARCH01`,
        name: `UniqueSearchName_${SUFFIX}`,
        resumeFile: {
          create: {
            originalFilename: 'x.pdf',
            storedFilename: `search-test-${SUFFIX}.pdf`,
            mimeType: 'application/pdf',
            fileSize: 100,
          },
        },
      },
    });
    createdCandidateIds.push(candidateWithName.id);

    const res = await request(app)
      .get(`/candidates?q=UniqueSearchName_${SUFFIX}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: { name: string }[] };
    expect(items.length).toBeGreaterThan(0);
    const found = items.find((i) => i.name?.includes(`UniqueSearchName_${SUFFIX}`));
    expect(found).toBeDefined();
  });

  it('[TC-3.1-010] pagination works (pageSize=1)', async () => {
    const res = await request(app)
      .get('/candidates?page=1&pageSize=1')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.items.length).toBeLessThanOrEqual(1);
  });

  it('[TC-3.1-009] interviewer can list candidates', async () => {
    const res = await request(app)
      .get('/candidates')
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/candidates');
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// GET /candidates/:id
// -----------------------------------------------------------------------

describe('GET /candidates/:id', () => {
  let candidateId: number;

  beforeAll(async () => {
    // Pick the first created candidate from upload tests
    candidateId = createdCandidateIds[0];
  });

  it('[TC-3.2-001] returns candidate detail with resumeMarkdown, full phone, and resumeFile meta', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const { candidate } = res.body as { candidate: Record<string, unknown> };
    expect(candidate.id).toBe(candidateId);

    // CandidateDetail includes these fields
    expect(candidate).toHaveProperty('resumeMarkdown');
    expect(candidate).toHaveProperty('phone'); // full phone (null here since stub extractor)
    expect(candidate).toHaveProperty('gender');
    expect(candidate).toHaveProperty('oneTimeCode');
    expect(candidate).toHaveProperty('oaDeadline');
    expect(candidate).toHaveProperty('statusHistory');
    expect(Array.isArray(candidate.statusHistory)).toBe(true);

    // resumeFile meta
    expect(candidate).toHaveProperty('resumeFile');
    const rf = candidate.resumeFile as Record<string, unknown> | null;
    expect(rf).not.toBeNull();
    expect(rf).toHaveProperty('id');
    expect(rf).toHaveProperty('originalFilename');
    expect(rf).toHaveProperty('mimeType');
    expect(rf).toHaveProperty('fileSize');
    expect(rf).toHaveProperty('createdAt');
  });

  it('[TC-3.2-001] returns 404 NOT_FOUND for non-existent id', async () => {
    const res = await request(app)
      .get('/candidates/999999999')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('[TC-3.2-007] interviewer can view candidate detail', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateId}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get(`/candidates/${candidateId}`);
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// PATCH /candidates/:id
// -----------------------------------------------------------------------

describe('PATCH /candidates/:id', () => {
  let candidateId: number;

  beforeAll(async () => {
    candidateId = createdCandidateIds[0];
  });

  it('[TC-3.2-002] coordinator can update name, email, phone, gender, resumeMarkdown', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie])
      .send({
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '+8613800138000',
        gender: 'male',
        resumeMarkdown: '# Updated Resume',
      });

    expect(res.status).toBe(200);
    const { candidate } = res.body as { candidate: Record<string, unknown> };
    expect(candidate.name).toBe('Updated Name');
    expect(candidate.email).toBe('updated@example.com');
    expect(candidate.phone).toBe('+8613800138000');
    expect(candidate.gender).toBe('male');
    expect(candidate.resumeMarkdown).toBe('# Updated Resume');
  });

  it('[TC-3.2-002] phoneMasked reflects updated phone (***8000)', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie])
      .send({ phone: '+8613800138000' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.phoneMasked).toBe('***8000');
  });

  it('[TC-3.2-002] screener can also update candidate info', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [screenerCookie])
      .send({ name: 'Screener Updated' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.name).toBe('Screener Updated');
  });

  it('[TC-3.2-007] interviewer cannot update candidate info (403)', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [interviewerCookie])
      .send({ name: 'Should Fail' });

    expect(res.status).toBe(403);
  });

  it('[TC-3.2-009] returns 400 VALIDATION_ERROR for invalid email', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie])
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-3.2-009] returns 400 VALIDATION_ERROR for invalid phone (too short)', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie])
      .send({ phone: '123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-3.2-009] returns 400 VALIDATION_ERROR for invalid gender', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .set('Cookie', [coordCookie])
      .send({ gender: 'other' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-3.2-011] returns 404 NOT_FOUND for non-existent id', async () => {
    const res = await request(app)
      .patch('/candidates/999999999')
      .set('Cookie', [coordCookie])
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app)
      .patch(`/candidates/${candidateId}`)
      .send({ name: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------
// DELETE /candidates/:id
// -----------------------------------------------------------------------

describe('DELETE /candidates/:id', () => {
  it('coordinator can delete a candidate and clear booked slot reference', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: 'wait_to_confirm_date',
        oneTimeCode: `DEL${SUFFIX.slice(-5).toUpperCase()}`,
        name: 'Delete Candidate',
        resumeFile: {
          create: {
            originalFilename: 'delete.txt',
            storedFilename: `delete-test-${SUFFIX}.txt`,
            mimeType: 'text/plain',
            fileSize: 20,
          },
        },
        statusHistories: {
          create: [{ toStatus: 'wait_to_confirm_date', note: 'delete test' }],
        },
        notificationLogs: {
          create: [{
            type: 'email',
            triggerEvent: 'new_to_oa',
            recipient: 'delete@example.com',
            subject: 'Delete test',
            content: 'Delete test',
            deliveryStatus: 'failed',
          }],
        },
      },
    });
    createdCandidateIds.push(candidate.id);

    const slot = await prisma.timeSlot.create({
      data: {
        interviewerId: interviewerUserId,
        candidateId: candidate.id,
        date: new Date('2026-06-01T00:00:00Z'),
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T10:00:00Z'),
      },
    });
    createdTimeSlotIds.push(slot.id);

    const res = await request(app)
      .delete(`/candidates/${candidate.id}`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(204);
    await expect(prisma.candidate.findUnique({ where: { id: candidate.id } })).resolves.toBeNull();
    await expect(prisma.statusHistory.findMany({ where: { candidateId: candidate.id } })).resolves.toHaveLength(0);
    await expect(prisma.notificationLog.findMany({ where: { candidateId: candidate.id } })).resolves.toHaveLength(0);
    const updatedSlot = await prisma.timeSlot.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.candidateId).toBeNull();

    await prisma.timeSlot.delete({ where: { id: slot.id } });
  });

  it('screener can delete a candidate', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: 'new',
        oneTimeCode: `DS${SUFFIX.slice(-6).toUpperCase()}`,
      },
    });
    createdCandidateIds.push(candidate.id);

    const res = await request(app)
      .delete(`/candidates/${candidate.id}`)
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(204);
    await expect(prisma.candidate.findUnique({ where: { id: candidate.id } })).resolves.toBeNull();
  });

  it('interviewer cannot delete a candidate', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: 'new',
        oneTimeCode: `DI${SUFFIX.slice(-6).toUpperCase()}`,
      },
    });
    createdCandidateIds.push(candidate.id);

    const res = await request(app)
      .delete(`/candidates/${candidate.id}`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(403);
    await expect(prisma.candidate.findUnique({ where: { id: candidate.id } })).resolves.not.toBeNull();
  });

  it('returns 404 NOT_FOUND for non-existent candidate', async () => {
    const res = await request(app)
      .delete('/candidates/999999999')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// -----------------------------------------------------------------------
// GET /candidates/:id/resume-file
// -----------------------------------------------------------------------

describe('GET /candidates/:id/resume-file', () => {
  let candidateId: number;

  beforeAll(async () => {
    candidateId = createdCandidateIds[0];
  });

  it('[TC-3.3-004] streams file with correct Content-Type and Content-Disposition', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateId}/resume-file`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('resume.txt');
  });

  it('[TC-3.3-004] screener can download resume file', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateId}/resume-file`)
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(200);
  });

  it('[TC-3.3-004] interviewer can download resume file', async () => {
    const res = await request(app)
      .get(`/candidates/${candidateId}/resume-file`)
      .set('Cookie', [interviewerCookie]);

    expect(res.status).toBe(200);
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get(`/candidates/${candidateId}/resume-file`);
    expect(res.status).toBe(401);
  });

  it('[TC-3.3-008] returns 404 for candidate without resume file', async () => {
    // Create a candidate without a resume file
    const bare = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: 'new',
        oneTimeCode: `NORF${SUFFIX.slice(-4)}`,
      },
    });
    createdCandidateIds.push(bare.id);

    const res = await request(app)
      .get(`/candidates/${bare.id}/resume-file`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(404);
  });
});
