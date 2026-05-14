import { describe, it, expect } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';

describe('lib/prisma', () => {
  it('exports a PrismaClient singleton', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('returns the same instance when imported twice', async () => {
    const mod = await import('../src/lib/prisma.js');
    expect(mod.prisma).toBe(prisma);
  });

  it('disconnectPrisma resolves without error', async () => {
    await expect(disconnectPrisma()).resolves.toBeUndefined();
  });
});
