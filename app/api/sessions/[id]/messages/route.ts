import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getMessagesForSessionOrBranch } from '../../../../../lib/branchMessages';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get('branchId') || null;
    const messages = await getMessagesForSessionOrBranch(prisma, params.id, branchId);
    return NextResponse.json(messages);
  } catch (e) {
    console.error('GET /api/sessions/[id]/messages:', e);
    return NextResponse.json(
      { error: 'Ошибка загрузки сообщений' },
      { status: 500 }
    );
  }
}
