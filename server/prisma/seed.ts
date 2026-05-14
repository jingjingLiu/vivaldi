import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminHash = await hashPassword('admin123');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminHash,
      name: 'Admin',
      locale: 'zhCN',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  const samplePosition = await prisma.position.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Software Engineer' },
  });

  const defaults: Array<{ key: string; value: string }> = [
    { key: 'company_name', value: 'Acme Corp' },
    { key: 'base_url', value: 'http://localhost:5173' },
    { key: 'oa_deadline_days', value: '7' },
    { key: 'smtp_config', value: JSON.stringify({ mode: 'smtp', host: '', port: 587, username: '', password: '', apiUrl: '', apiAppCode: '', apiAppSecret: '' }) },
    { key: 'sms_config', value: JSON.stringify({ apiUrl: '', apiKey: '', senderNumber: '' }) },
  ];
  for (const s of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // eslint-disable-next-line no-console
  console.log(`seeded: admin user id=${admin.id}, position id=${samplePosition.id}, ${defaults.length} settings`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
