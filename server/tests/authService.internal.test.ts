import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';
import { authenticateInternal } from '../src/services/authService.js';
import { HttpError } from '../src/errors/HttpError.js';

const U = `internal_${Date.now()}`;

beforeAll(async () => {
  await prisma.user.create({
    data: {
      username: U,
      passwordHash: await hashPassword('secret123!'),
      name: 'Internal Tester',
      enabled: true,
      roles: { create: [{ role: Role.coordinator }, { role: Role.interviewer }] },
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: 'internal_' } } });
  await disconnectPrisma();
});

describe('authService.authenticateInternal', () => {
  it('returns principal on correct credentials', async () => {
    const principal = await authenticateInternal(U, 'secret123!');
    expect(principal.userId).toBeGreaterThan(0);
    expect(principal.kind).toBe('internal');
    expect(principal.roles.sort()).toEqual(['coordinator', 'interviewer']);
  });

  it('throws 401 on wrong password', async () => {
    await expect(authenticateInternal(U, 'wrong')).rejects.toBeInstanceOf(HttpError);
    await expect(authenticateInternal(U, 'wrong')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 on unknown username', async () => {
    await expect(authenticateInternal('nobody_xyz', 'anything')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 403 ACCOUNT_DISABLED on disabled user', async () => {
    const disabledName = `${U}_disabled`;
    await prisma.user.create({
      data: {
        username: disabledName,
        passwordHash: await hashPassword('secret123!'),
        name: 'Disabled',
        enabled: false,
        roles: { create: [{ role: Role.coordinator }] },
      },
    });
    try {
      await expect(authenticateInternal(disabledName, 'secret123!')).rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_DISABLED' });
    } finally {
      await prisma.user.deleteMany({ where: { username: disabledName } });
    }
  });
});
