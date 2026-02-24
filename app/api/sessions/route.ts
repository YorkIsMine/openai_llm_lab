import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });
    return NextResponse.json(sessions);
  } catch (e) {
    console.error('GET /api/sessions:', e);
    return NextResponse.json(
      { error: 'Ошибка загрузки сессий' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const session = await prisma.session.create({
      data: { title: 'Новый чат' },
    });
    return NextResponse.json({ id: session.id });
  } catch (e) {
    console.error('POST /api/sessions:', e);
    return NextResponse.json(
      { error: 'Ошибка создания сессии' },
      { status: 500 }
    );
  }
}
