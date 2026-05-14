import { describe, it, expect, afterAll } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role, CandidateStatus, AnswerType } from '@prisma/client';

const UNIQUE = Date.now();

afterAll(async () => {
  // Get all positions created in this test
  const positions = await prisma.position.findMany({
    where: { name: { startsWith: `SchemaTest-${UNIQUE}` } },
  });

  // Explicitly delete related records
  for (const pos of positions) {
    // Delete OaForms and their questions (cascade handles questions)
    await prisma.oaForm.deleteMany({ where: { positionId: pos.id } });
    // Delete candidates and their status histories (cascade handles histories)
    await prisma.candidate.deleteMany({ where: { positionId: pos.id } });
    // Delete position interviewers
    await prisma.positionInterviewer.deleteMany({ where: { positionId: pos.id } });
  }

  // Now delete positions and users
  await prisma.position.deleteMany({ where: { name: { startsWith: `SchemaTest-${UNIQUE}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `schematest-${UNIQUE}` } } });
  await disconnectPrisma();
});

describe('schema integration', () => {
  it('creates a User with multiple roles', async () => {
    const user = await prisma.user.create({
      data: {
        username: `schematest-${UNIQUE}-u1`,
        passwordHash: 'x'.repeat(60),
        name: 'Tester',
        roles: { create: [{ role: Role.coordinator }, { role: Role.interviewer }] },
      },
      include: { roles: true },
    });
    expect(user.roles).toHaveLength(2);
    expect(user.roles.map((r) => r.role).sort()).toEqual([Role.coordinator, Role.interviewer]);
  });

  it('enforces unique (user_id, role)', async () => {
    const user = await prisma.user.create({
      data: {
        username: `schematest-${UNIQUE}-u2`,
        passwordHash: 'x'.repeat(60),
        name: 'Tester',
        roles: { create: [{ role: Role.coordinator }] },
      },
    });
    await expect(
      prisma.userRole.create({ data: { userId: user.id, role: Role.coordinator } }),
    ).rejects.toThrow();
  });

  it('creates Position → OaForm → OaQuestion chain (1:1 → 1:N)', async () => {
    const pos = await prisma.position.create({ data: { name: `SchemaTest-${UNIQUE}-p1` } });
    const form = await prisma.oaForm.create({
      data: {
        positionId: pos.id,
        timeLimitMinutes: 60,
        questions: {
          create: [
            { sortOrder: 1, questionText: 'Q1', answerType: AnswerType.text },
            { sortOrder: 2, questionText: 'Q2', answerType: AnswerType.code },
          ],
        },
      },
      include: { questions: true },
    });
    expect(form.questions).toHaveLength(2);

    await expect(
      prisma.oaForm.create({ data: { positionId: pos.id, timeLimitMinutes: 30 } }),
    ).rejects.toThrow();
  });

  it('enforces unique one_time_code on Candidate', async () => {
    const pos = await prisma.position.create({ data: { name: `SchemaTest-${UNIQUE}-p2` } });
    const code1 = `A${UNIQUE}`.slice(0, 10);
    await prisma.candidate.create({
      data: { positionId: pos.id, oneTimeCode: code1, status: CandidateStatus.new },
    });
    await expect(
      prisma.candidate.create({
        data: { positionId: pos.id, oneTimeCode: code1, status: CandidateStatus.new },
      }),
    ).rejects.toThrow();
  });

  it('cascades Candidate delete to dependent rows', async () => {
    const pos = await prisma.position.create({ data: { name: `SchemaTest-${UNIQUE}-p3` } });
    const code2 = `B${UNIQUE}`.slice(0, 10);
    const cand = await prisma.candidate.create({
      data: {
        positionId: pos.id,
        oneTimeCode: code2,
        status: CandidateStatus.waiting_for_oa,
        statusHistories: { create: [{ toStatus: CandidateStatus.waiting_for_oa }] },
      },
    });
    await prisma.candidate.delete({ where: { id: cand.id } });
    const histories = await prisma.statusHistory.findMany({ where: { candidateId: cand.id } });
    expect(histories).toHaveLength(0);
  });
});
