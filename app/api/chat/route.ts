import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ChatRequest } from '@/types';
import { prisma } from '../../../lib/prisma';
import { buildMessagesWithSummaries } from '../../../lib/chatContext';

const openai = new OpenAI();

export async function POST(req: Request) {
    try {
        const { messages, model, sessionId: reqSessionId, temperature, top_p, stop, max_tokens }: ChatRequest = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'Неверный формат сообщений' },
                { status: 400 }
            );
        }

        const userMsg = messages.filter((m) => m.role === 'user').pop();
        let sessionId = reqSessionId || null;

        const systemMsg = messages.find((m) => m.role === 'system');
        const systemContent = systemMsg?.content?.trim() || 'Ты полезный AI-ассистент.';

        if (!sessionId) {
            const session = await prisma.session.create({
                data: { title: userMsg?.content?.slice(0, 50) || 'Новый чат' },
            });
            sessionId = session.id;
            if (systemMsg && systemMsg.content) {
                await prisma.message.create({
                    data: { sessionId, role: 'system', content: systemMsg.content },
                });
            }
        }

        if (userMsg && sessionId) {
            await prisma.message.create({
                data: {
                    sessionId,
                    role: userMsg.role,
                    content: userMsg.content,
                },
            });
        }

        const dbMessages = await prisma.message.findMany({
            where: { sessionId: sessionId! },
            orderBy: { createdAt: 'asc' },
            select: { role: true, content: true },
        });

        const requestMessages = await buildMessagesWithSummaries(
            prisma,
            openai,
            sessionId!,
            dbMessages,
            systemContent
        );

        const body = {
            model: model || 'gpt-4o',
            messages: requestMessages as OpenAI.Chat.ChatCompletionMessageParam[],
            ...(typeof temperature === 'number' && temperature >= 0 && temperature <= 2 && { temperature }),
            ...(typeof top_p === 'number' && top_p >= 0 && top_p <= 1 && { top_p }),
            ...(Array.isArray(stop) && stop.length > 0 && { stop: stop.map((s) => String(s).trim()).filter(Boolean).slice(0, 4) }),
            ...(typeof max_tokens === 'number' && max_tokens > 0 && { max_tokens }),
        };
        const response = await openai.chat.completions.create(body);
        const assistantMessage = response.choices[0].message;

        if (sessionId && assistantMessage) {
            await prisma.message.create({
                data: {
                    sessionId,
                    role: assistantMessage.role || 'assistant',
                    content: assistantMessage.content || '',
                },
            });
        }

        return NextResponse.json({
            message: assistantMessage,
            usage: response.usage ?? undefined,
            sessionId,
        });

    } catch (error: unknown) {
        console.error('Ошибка OpenAI API:', error);
        const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
