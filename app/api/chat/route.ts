import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ChatRequest } from '@/types';
import { prisma } from '../../../lib/prisma';
import { buildMessagesByStrategy, extractFactsFromMessages } from '../../../lib/chatContext';
import { getMessagesForSessionOrBranch } from '../../../lib/branchMessages';

const openai = new OpenAI();

export async function POST(req: Request) {
    try {
        const {
            messages,
            model,
            sessionId: reqSessionId,
            contextStrategy = 'sliding_window',
            windowSize = 20,
            branchId: reqBranchId = null,
            temperature,
            top_p,
            stop,
            max_tokens,
        }: ChatRequest = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'Неверный формат сообщений' },
                { status: 400 }
            );
        }

        const userMsg = messages.filter((m) => m.role === 'user').pop();
        let sessionId = reqSessionId || null;
        const branchId = reqBranchId || null;

        const systemMsg = messages.find((m) => m.role === 'system');
        const systemContent = systemMsg?.content?.trim() || 'Ты полезный AI-ассистент.';

        if (!sessionId) {
            const session = await prisma.session.create({
                data: { title: userMsg?.content?.slice(0, 50) || 'Новый чат' },
            });
            sessionId = session.id;
            if (systemMsg && systemMsg.content) {
                await prisma.message.create({
                    data: { sessionId, branchId, role: 'system', content: systemMsg.content },
                });
            }
        }

        if (userMsg && sessionId) {
            await prisma.message.create({
                data: {
                    sessionId,
                    branchId,
                    role: userMsg.role,
                    content: userMsg.content,
                },
            });
        }

        const dbMessages = await getMessagesForSessionOrBranch(prisma, sessionId!, branchId);

        let facts: Record<string, string> = {};
        if (contextStrategy === 'sticky_facts') {
            const session = await prisma.session.findUnique({
                where: { id: sessionId! },
                select: { facts: true },
            });
            if (session?.facts) {
                try {
                    facts = typeof session.facts === 'string' ? JSON.parse(session.facts) : (session.facts as Record<string, string>);
                } catch {
                    facts = {};
                }
            }
        }

        const requestMessages = await buildMessagesByStrategy(
            prisma,
            openai,
            contextStrategy,
            sessionId!,
            dbMessages,
            systemContent,
            { windowSize, facts }
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
                    branchId,
                    role: assistantMessage.role || 'assistant',
                    content: assistantMessage.content || '',
                },
            });
        }

        if (contextStrategy === 'sticky_facts' && sessionId) {
            const updated = await extractFactsFromMessages(
                openai,
                [...dbMessages, { role: 'user', content: userMsg?.content ?? '' }, { role: 'assistant', content: assistantMessage?.content ?? '' }],
                facts
            );
            await prisma.session.update({
                where: { id: sessionId },
                data: { facts: JSON.stringify(updated) },
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
