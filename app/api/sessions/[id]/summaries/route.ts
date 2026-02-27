import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const summaries = await prisma.sessionSummary.findMany({
      where: { sessionId: params.id },
      orderBy: { chunkIndex: 'asc' },
      select: { chunkIndex: true, content: true, createdAt: true },
    });
    return NextResponse.json(summaries);
  } catch (e) {
    console.error('GET /api/sessions/[id]/summaries:', e);
    return NextResponse.json(
      { error: 'Ошибка загрузки саммари' },
      { status: 500 }
    );
  }
}
