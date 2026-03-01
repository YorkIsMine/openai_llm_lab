import type { PrismaClient } from '@prisma/client';

/** Загрузка сообщений сессии: либо основная ветка (branchId=null), либо ветка (base + свои) */
export async function getMessagesForSessionOrBranch(
  prisma: PrismaClient,
  sessionId: string,
  branchId: string | null
): Promise<{ role: string; content: string }[]> {
  if (!branchId) {
    const list = await prisma.message.findMany({
      where: { sessionId, branchId: null },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    return list;
  }
  const branch = await prisma.branch.findUnique({
    where: { id: branchId, sessionId },
  });
  if (!branch) return [];
  const base = await prisma.message.findMany({
    where: { sessionId, branchId: null },
    orderBy: { createdAt: 'asc' },
    take: branch.baseCount,
    select: { role: true, content: true },
  });
  const tail = await prisma.message.findMany({
    where: { sessionId, branchId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });
  return [...base, ...tail];
}
