import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ChatRequest } from '@/types';

// Инициализируем клиент OpenAI
// Он автоматически подхватит process.env.OPENAI_API_KEY
const openai = new OpenAI();

export async function POST(req: Request) {
    try {
        const { messages, model, temperature, top_p, stop, max_tokens }: ChatRequest = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'Неверный формат сообщений' },
                { status: 400 }
            );
        }

        const body: {
            model: string;
            messages: typeof messages;
            temperature?: number;
            top_p?: number;
            stop?: string[];
            max_tokens?: number;
        } = {
            model: model || 'gpt-4o',
            messages,
        };
        if (typeof temperature === 'number' && temperature >= 0 && temperature <= 2) {
            body.temperature = temperature;
        }
        if (typeof top_p === 'number' && top_p >= 0 && top_p <= 1) {
            body.top_p = top_p;
        }
        if (Array.isArray(stop) && stop.length > 0) {
            body.stop = stop.map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
        }
        if (typeof max_tokens === 'number' && max_tokens > 0) {
            body.max_tokens = max_tokens;
        }

        const response = await openai.chat.completions.create(body);

        return NextResponse.json({
            message: response.choices[0].message,
            usage: response.usage ?? undefined,
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
