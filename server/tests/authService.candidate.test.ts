import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { CandidateStatus } from '@prisma/client';
import { authenticateCandidate } from '../src/services/authService.js';

const U = Date.now();
let activeCandidateId: number;
let terminalCandidateId: number;
let positionId: number;
let activeCode: string;
let terminalCode: string;

beforeAll(async () => {
  const pos = await prisma.position.create({ data: { name: `AuthTest-${U}` } });
  positionId = pos.id;

  activeCode = `ACT${U}`.slice(0, 10);
  terminalCode = `TRM${U}`.slice(0, 10);

  const active = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: activeCode,
      phone: '13900001234',
      status: CandidateStatus.waiting_for_oa,
    },
  });
  activeCandidateId = active.id;

  const terminal = await prisma.candidate.create({
    data: {
      positionId,
      oneTimeCode: terminalCode,
      phone: '13900005678',
      status: CandidateStatus.rejected,
    },
  });
  terminalCandidateId = terminal.id;
});

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { id: { in: [activeCandidateId, terminalCandidateId] } } });
  await prisma.position.deleteMany({ where: { id: positionId } });
  await disconnectPrisma();
});

describe('authService.authenticateCandidate', () => {
  it('returns principal when code and phone last-4 match', async () => {
    const principal = await authenticateCandidate(activeCode, '1234');
    expect(principal.kind).toBe('candidate');
    expect(principal.userId).toBe(activeCandidateId);
    expect(principal.roles).toEqual([]);
  });

  it('rejects wrong phone last-4', async () => {
    await expect(authenticateCandidate(activeCode, '0000')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects unknown code', async () => {
    await expect(authenticateCandidate('NOEXIST', '1234')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects candidate in terminal status', async () => {
    await expect(authenticateCandidate(terminalCode, '5678')).rejects.toMatchObject({ statusCode: 401 });
  });
});
