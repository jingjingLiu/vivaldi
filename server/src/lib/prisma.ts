import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

prisma.$on('error' as never, (e: unknown) => logger.error({ err: e }, 'prisma error'));
prisma.$on('warn' as never, (e: unknown) => logger.warn({ evt: e }, 'prisma warning'));

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
