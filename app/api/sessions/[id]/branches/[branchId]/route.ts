import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; branchId: string } }
) {
  try {
    await prisma.branch.deleteMany({
      where: {
        id: params.branchId,
        sessionId: params.id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/sessions/[id]/branches/[branchId]:', e);
    return NextResponse.json(
      { error: 'Ошибка удаления ветки' },
      { status: 500 }
    );
  }
}
