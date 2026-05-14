import { describe, it, expect, afterAll } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { verifyPassword } from '../src/lib/password.js';

afterAll(async () => {
  await disconnectPrisma();
});

describe('seed output', () => {
  it('admin user exists with coordinator role and known password', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      include: { roles: true },
    });
    expect(admin).not.toBeNull();
    expect(admin!.roles.some((r) => r.role === Role.coordinator)).toBe(true);
    expect(await verifyPassword('admin123', admin!.passwordHash)).toBe(true);
  });

  it('sample position exists', async () => {
    const pos = await prisma.position.findFirst({ where: { name: 'Software Engineer' } });
    expect(pos).not.toBeNull();
  });

  it('required system settings are present', async () => {
    const keys = ['company_name', 'base_url', 'oa_deadline_days', 'smtp_config', 'sms_config'];
    for (const key of keys) {
      const row = await prisma.systemSetting.findUnique({ where: { key } });
      expect(row, `setting ${key} should exist`).not.toBeNull();
    }
  });
});
