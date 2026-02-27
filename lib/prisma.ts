import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });
}

let instance = globalForPrisma.prisma ?? createPrisma();
// Если закэширован старый клиент без SessionSummary (например после добавления модели) — пересоздаём
if (typeof (instance as { sessionSummary?: unknown }).sessionSummary === 'undefined') {
  instance = createPrisma();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = instance;
  }
}

export const prisma = instance;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
