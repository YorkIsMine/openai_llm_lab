import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const messages = await prisma.message.findMany({
      where: { sessionId: params.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    return NextResponse.json(messages);
  } catch (e) {
    console.error('GET /api/sessions/[id]/messages:', e);
    return NextResponse.json(
      { error: 'Ошибка загрузки сообщений' },
      { status: 500 }
    );
  }
}
