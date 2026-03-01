import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const branches = await prisma.branch.findMany({
      where: { sessionId: params.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, baseCount: true, createdAt: true },
    });
    return NextResponse.json(branches);
  } catch (e) {
    console.error('GET /api/sessions/[id]/branches:', e);
    return NextResponse.json(
      { error: 'Ошибка загрузки веток' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { name = 'Ветка', baseCount = 0 } = body;
    const sessionId = params.id;
    const count =
      typeof baseCount === 'number' && baseCount >= 0
        ? baseCount
        : await prisma.message.count({
            where: { sessionId, branchId: null },
          });
    const branch = await prisma.branch.create({
      data: {
        sessionId,
        name: String(name).trim() || 'Ветка',
        baseCount: typeof baseCount === 'number' && baseCount >= 0 ? baseCount : count,
      },
    });
    return NextResponse.json(branch);
  } catch (e) {
    console.error('POST /api/sessions/[id]/branches:', e);
    return NextResponse.json(
      { error: 'Ошибка создания ветки' },
      { status: 500 }
    );
  }
}
