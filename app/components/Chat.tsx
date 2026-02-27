'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Message, TokenUsage } from '@/types';

const MODELS = [
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
];

// Максимум токенов контекста (вход + ответ) по моделям OpenAI.
const CONTEXT_LIMITS: Record<string, number> = {
    'gpt-3.5-turbo': 16_385,
    'gpt-4': 8_192,
    'gpt-4-turbo': 128_000,
    'gpt-4-turbo-preview': 128_000,
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'gpt-4.1': 128_000,
    'gpt-4.1-mini': 128_000,
    'gpt-5': 128_000,
    'gpt-5.1': 128_000,
    'gpt-5.2': 128_000,
};

function formatContextLimit(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return String(n);
}

// USD за 1K токенов (input, output). Примерные значения по документации OpenAI.
const PRICES_PER_1K: Record<string, { input: number; output: number }> = {
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4.1': { input: 0.004, output: 0.012 },
    'gpt-4.1-mini': { input: 0.0002, output: 0.0008 },
    'gpt-5': { input: 0.008, output: 0.024 },
    'gpt-5.1': { input: 0.007, output: 0.021 },
    'gpt-5.2': { input: 0.006, output: 0.018 },
};

const defaultUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
const DEFAULT_SYSTEM_PROMPT = 'Ты услужливый и умный AI ассистент.';

type SessionSummaryItem = { chunkIndex: number; content: string; createdAt: string };

/** Цвет индикатора температуры: 0 — голубой, 2 — красный */
function temperatureColor(t: number): string {
    const clamp = Math.max(0, Math.min(1, t / 2));
    const r = Math.round(14 + (239 - 14) * clamp);
    const g = Math.round(165 + (68 - 165) * clamp);
    const b = Math.round(233 + (68 - 233) * clamp);
    return `rgb(${r},${g},${b})`;
}

/** Цвет индикатора Top P: 0 — изумрудный, 1 — фиолетовый */
function topPColor(p: number): string {
    const clamp = Math.max(0, Math.min(1, p));
    const r = Math.round(5 + (167 - 5) * clamp);
    const g = Math.round(150 + (139 - 150) * clamp);
    const b = Math.round(105 + (250 - 105) * clamp);
    return `rgb(${r},${g},${b})`;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
    const [sessionUsage, setSessionUsage] = useState<TokenUsage>(defaultUsage);
    const [lastRequestUsage, setLastRequestUsage] = useState<TokenUsage | null>(null);
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
    const [temperature, setTemperature] = useState(0.7);
    const [topP, setTopP] = useState(1);
    const [stopWords, setStopWords] = useState('');
    const [maxTokens, setMaxTokens] = useState<number | ''>(0);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [sessionsLoaded, setSessionsLoaded] = useState(false);
    const [sessionSummaries, setSessionSummaries] = useState<SessionSummaryItem[]>([]);
    const [summaryWindowOpen, setSummaryWindowOpen] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const loadSummaries = useCallback(async (sessionId: string | null) => {
        if (!sessionId) {
            setSessionSummaries([]);
            return;
        }
        try {
            const res = await fetch(`/api/sessions/${sessionId}/summaries`);
            if (res.ok) {
                const data = await res.json();
                setSessionSummaries(Array.isArray(data) ? data : []);
            } else {
                setSessionSummaries([]);
            }
        } catch {
            setSessionSummaries([]);
        }
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    useEffect(() => {
        if (sessionsLoaded) return;
        let cancelled = false;

        (async () => {
            try {
                const sessRes = await fetch('/api/sessions');
                if (!sessRes.ok || cancelled) return;
                const sessions: { id: string }[] = await sessRes.json();
                if (sessions.length > 0) {
                    const lastId = sessions[0].id;
                    setCurrentSessionId(lastId);
                    const msgRes = await fetch(`/api/sessions/${lastId}/messages`);
                    if (!msgRes.ok || cancelled) return;
                    const list: { role: string; content: string }[] = await msgRes.json();
                    if (list.length > 0) {
                        const systemMsg = list.find((m) => m.role === 'system');
                        const rest = list.filter((m) => m.role !== 'system') as Message[];
                        if (systemMsg) setSystemPrompt(systemMsg.content);
                        setMessages(
                            systemMsg
                                ? ([{ role: 'system', content: systemMsg.content }, ...rest] as Message[])
                                : ([{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...rest] as Message[])
                        );
                    }
                } else {
                    const createRes = await fetch('/api/sessions', { method: 'POST' });
                    if (!createRes.ok || cancelled) return;
                    const { id } = await createRes.json();
                    setCurrentSessionId(id);
                }
            } catch (e) {
                console.error('Load sessions:', e);
                const createRes = await fetch('/api/sessions', { method: 'POST' });
                if (createRes.ok && !cancelled) {
                    const { id } = await createRes.json();
                    setCurrentSessionId(id);
                }
            } finally {
                if (!cancelled) setSessionsLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sessionsLoaded]);

    useEffect(() => {
        loadSummaries(currentSessionId);
    }, [currentSessionId, loadSummaries]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', content: input.trim() };
        const conversation = [...messages.filter(m => m.role !== 'system'), userMessage];
        const messagesToSend: Message[] = [
            { role: 'system', content: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT },
            ...conversation,
        ];

        const systemContent = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
        setMessages((prev) => [
            { role: 'system', content: systemContent },
            ...prev.filter(m => m.role !== 'system'),
            userMessage,
        ]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messagesToSend,
                    model: selectedModel,
                    sessionId: currentSessionId,
                    temperature,
                    top_p: topP,
                    stop: stopWords
                        ? stopWords
                            .split(/[\n,]+/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 4)
                        : undefined,
                    max_tokens: typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Ошибка при получении ответа');
            }

            const data = await response.json();

            const sid = data.sessionId ?? currentSessionId;
            if (data.sessionId) setCurrentSessionId(data.sessionId);
            if (data.message) {
                setMessages((prev) => [...prev, data.message]);
            }
            if (sid) loadSummaries(sid);
            if (data.usage) {
                setLastRequestUsage({
                    prompt_tokens: data.usage.prompt_tokens ?? 0,
                    completion_tokens: data.usage.completion_tokens ?? 0,
                    total_tokens: data.usage.total_tokens ?? 0,
                });
                setSessionUsage((prev) => ({
                    prompt_tokens: prev.prompt_tokens + (data.usage.prompt_tokens ?? 0),
                    completion_tokens: prev.completion_tokens + (data.usage.completion_tokens ?? 0),
                    total_tokens: prev.total_tokens + (data.usage.total_tokens ?? 0),
                }));
            }
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Произошла ошибка при получении ответа от сервера.' }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const clearChat = async () => {
        const systemContent = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
        try {
            const res = await fetch('/api/sessions', { method: 'POST' });
            if (res.ok) {
                const { id } = await res.json();
                setCurrentSessionId(id);
            }
        } catch (e) {
            console.error('Create session:', e);
        }
        setMessages([{ role: 'system', content: systemContent }]);
        setSessionUsage(defaultUsage);
        setLastRequestUsage(null);
        setSessionSummaries([]);
        setSummaryWindowOpen(false);
    };

    const totalCostUSD = useMemo(() => {
        const prices = PRICES_PER_1K[selectedModel] ?? PRICES_PER_1K['gpt-4o'];
        const inputCost = (sessionUsage.prompt_tokens / 1000) * prices.input;
        const outputCost = (sessionUsage.completion_tokens / 1000) * prices.output;
        return inputCost + outputCost;
    }, [selectedModel, sessionUsage]);

    const contextLimit = CONTEXT_LIMITS[selectedModel] ?? 128_000;

    return (
        <div className="flex h-full w-full overflow-hidden font-sans text-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/30">

            {/* Левая панель — расширенная */}
            <aside className="w-[420px] min-w-[380px] max-w-[520px] flex flex-col p-5 shrink-0 hidden md:flex border-r border-slate-700/40 bg-slate-900/50 backdrop-blur-sm overflow-y-auto custom-scrollbar">
                <div className="mb-5">
                    <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                        AI Assistant
                    </h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Сессия
                    </p>
                </div>

                <div className="mb-5 space-y-2">
                    <label htmlFor="model-select" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Модель OpenAI
                    </label>
                    <div className="relative">
                        <select
                            id="model-select"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={isLoading}
                            className="w-full appearance-none bg-slate-800/80 border border-slate-600/40 text-slate-100 py-2.5 pl-4 pr-9 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all disabled:opacity-50 hover:border-slate-500/50"
                        >
                            {MODELS.map((model) => (
                                <option key={model.id} value={model.id} className="bg-slate-800 text-slate-200">
                                    {model.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                <section className="mb-5 rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Системный промпт
                    </h3>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        placeholder="Роль и инструкции для модели..."
                        className="w-full min-h-[100px] resize-y rounded-lg bg-slate-800/80 border border-slate-600/40 text-slate-100 px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 disabled:opacity-50"
                        disabled={isLoading}
                        rows={4}
                    />
                </section>

                <section className="mb-5 rounded-xl border border-slate-700/40 bg-slate-800/40 p-4 space-y-4">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Параметры генерации
                    </h3>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="temperature" className="text-sm text-slate-500">Temperature</label>
                            <span className="text-sm font-semibold tabular-nums transition-colors duration-150" style={{ color: temperatureColor(temperature) }}>{temperature}</span>
                        </div>
                        <input
                            id="temperature"
                            type="range"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(Number(e.target.value))}
                            disabled={isLoading}
                            className="range-temperature w-full h-2 rounded-lg appearance-none bg-transparent disabled:opacity-50"
                        />
                        <p className="text-[11px] text-slate-500 mt-0.5">0 — детерминировано, 2 — креативнее</p>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="top_p" className="text-sm text-slate-500">Top P</label>
                            <span className="text-sm font-semibold tabular-nums transition-colors duration-150" style={{ color: topPColor(topP) }}>{topP}</span>
                        </div>
                        <input
                            id="top_p"
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={topP}
                            onChange={(e) => setTopP(Number(e.target.value))}
                            disabled={isLoading}
                            className="range-top-p w-full h-2 rounded-lg appearance-none bg-transparent disabled:opacity-50"
                        />
                        <p className="text-[11px] text-slate-500 mt-0.5">Nucleus sampling (0–1)</p>
                    </div>
                </section>

                <section className="mb-5 rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                        Стоп-слова
                    </h3>
                    <textarea
                        value={stopWords}
                        onChange={(e) => setStopWords(e.target.value)}
                        placeholder="До 4 фраз, по одной на строку или через запятую. Генерация остановится при появлении любой из них."
                        className="w-full min-h-[72px] resize-y rounded-lg bg-slate-800/80 border border-slate-600/40 text-slate-100 px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 disabled:opacity-50"
                        disabled={isLoading}
                        rows={3}
                    />
                </section>

                <section className="mb-5 rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Лимит токенов ответа
                    </h3>
                    <input
                        type="number"
                        min={0}
                        max={128000}
                        value={maxTokens === '' || maxTokens === 0 ? '' : maxTokens}
                        onChange={(e) => {
                            const v = e.target.value;
                            setMaxTokens(v === '' ? 0 : Math.min(128000, Math.max(0, parseInt(v, 10) || 0)));
                        }}
                        placeholder="Не задан"
                        className="w-full rounded-lg bg-slate-800/80 border border-slate-600/40 text-slate-100 px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        disabled={isLoading}
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">Макс. токенов в ответе (0 или пусто — без лимита)</p>
                </section>

                <div className="space-y-4 flex-1 min-h-0">
                    <section className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                            Макс. токенов (контекст модели)
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-1.5">
                            Лимит выбранной модели на один запрос (вход + ответ)
                        </p>
                        <div className="text-lg font-semibold tabular-nums text-blue-300">
                            {formatContextLimit(contextLimit)} токенов
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                            Последний вопрос‑ответ в токенах
                        </h3>
                        {lastRequestUsage ? (
                            <div className="space-y-2.5 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Вход (prompt)</span>
                                    <span className="font-medium tabular-nums text-slate-200">{lastRequestUsage.prompt_tokens.toLocaleString()}</span>
                                </div>
                                <div className="h-px bg-slate-700/50" />
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Выход (completion)</span>
                                    <span className="font-medium tabular-nums text-slate-200">{lastRequestUsage.completion_tokens.toLocaleString()}</span>
                                </div>
                                <div className="h-px bg-slate-700/50" />
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Всего</span>
                                    <span className="font-semibold tabular-nums text-blue-300">{lastRequestUsage.total_tokens.toLocaleString()}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">—</p>
                        )}
                    </section>

                    <section className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                            Расход токенов (сессия)
                        </h3>
                        <div className="space-y-2.5 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Входные (prompt)</span>
                                <span className="font-medium tabular-nums text-slate-200">{sessionUsage.prompt_tokens.toLocaleString()}</span>
                            </div>
                            <div className="h-px bg-slate-700/50" />
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Выходные (completion)</span>
                                <span className="font-medium tabular-nums text-slate-200">{sessionUsage.completion_tokens.toLocaleString()}</span>
                            </div>
                            <div className="h-px bg-slate-700/50" />
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Всего токенов</span>
                                <span className="font-semibold tabular-nums text-blue-300">{sessionUsage.total_tokens.toLocaleString()}</span>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                            Стоимость
                        </h3>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">За все токены (сессия)</span>
                            <span className="font-semibold text-emerald-400">
                                ${totalCostUSD.toFixed(4)} USD
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            По тарифам выбранной модели
                        </p>
                    </section>

                </div>
            </aside>

            {/* Правая часть: чат + ввод */}
            <main className="flex-1 flex flex-col min-w-0 h-full">
                <header className="md:hidden border-b border-slate-700/40 p-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-sm shrink-0">
                    <h1 className="text-base font-semibold text-slate-100">AI Assistant</h1>
                    <button type="button" onClick={clearChat} className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-600/40">
                        Сброс
                    </button>
                </header>

                {/* История чата */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                    <div className="max-w-2xl mx-auto space-y-5 pb-6">
                        {messages.filter(m => m.role === 'system').map((_, i) => (
                            <div key={`sys-${i}`} className="flex justify-center">
                                <span className="text-xs text-slate-500 border border-slate-600/40 rounded-full px-4 py-1.5 bg-slate-800/40">
                                    Начало сессии
                                </span>
                            </div>
                        ))}

                        {messages.filter(m => m.role !== 'system').map((message, i) => (
                            <div
                                key={`msg-${i}`}
                                className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-message-in`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3.5 ${
                                        message.role === 'user'
                                            ? 'rounded-br-md bg-blue-600/90 text-white shadow-lg shadow-blue-900/20'
                                            : 'rounded-bl-md bg-slate-800/90 text-slate-100 border border-slate-600/30 shadow-sm'
                                    }`}
                                >
                                    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${message.role === 'user' ? 'text-blue-100/90' : 'text-slate-400'}`}>
                                        {message.role === 'user' ? 'Вы' : 'AI'}
                                    </div>
                                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-100">
                                        {message.content}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex justify-start animate-message-in">
                                <div className="rounded-2xl rounded-bl-md bg-slate-800/90 border border-slate-600/30 px-4 py-3.5 flex items-center gap-3 shadow-sm">
                                    <span className="text-sm text-slate-400">Печатает</span>
                                    <div className="flex gap-1">
                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                </div>

                {/* Поле ввода */}
                <div className="shrink-0 p-4 sm:p-6 pt-2 border-t border-slate-700/40 bg-gradient-to-t from-slate-900/80 to-transparent">
                    <form
                        onSubmit={handleSubmit}
                        className="max-w-2xl mx-auto relative rounded-2xl bg-slate-800/80 border border-slate-600/40 shadow-xl focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all duration-200 flex items-stretch"
                    >
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Напишите сообщение... (Shift+Enter — новая строка)"
                            className="flex-1 resize-none bg-transparent p-4 pl-4 pr-3 py-3.5 text-slate-100 placeholder-slate-500 text-[15px] leading-relaxed focus:outline-none min-h-[56px] max-h-[200px] border-0"
                            rows={2}
                            disabled={isLoading}
                        />
                        <div className="flex items-center gap-2 pr-2.5 py-2.5">
                            <button
                                type="button"
                                onClick={() => setSummaryWindowOpen(true)}
                                className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-300 bg-slate-700/60 border border-slate-600/40 hover:bg-slate-600/60 hover:text-slate-200 transition-all shrink-0"
                                title="Результат суммаризации"
                            >
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Саммари
                                {sessionSummaries.length > 0 && (
                                    <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-blue-500/80 text-[10px] font-bold text-white flex items-center justify-center">
                                        {sessionSummaries.length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={clearChat}
                                disabled={isLoading || messages.filter(m => m.role !== 'system').length === 0}
                                className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-300 bg-slate-700/60 border border-slate-600/40 hover:bg-slate-600/60 hover:text-slate-200 transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0"
                            >
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Новый чат
                            </button>
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-md hover:bg-blue-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-500 disabled:active:scale-100"
                            >
                                {isLoading ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </form>
                    <p className="text-center mt-2 text-[11px] text-slate-500">
                        AI может допускать ошибки. Проверяйте важную информацию.
                    </p>
                </div>
            </main>

            {/* Окно результата суммаризации */}
            {summaryWindowOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSummaryWindowOpen(false)}
                >
                    <div
                        className="bg-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 shrink-0">
                            <h2 className="text-lg font-semibold text-slate-100">
                                Результат суммаризации
                            </h2>
                            <button
                                type="button"
                                onClick={() => setSummaryWindowOpen(false)}
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
                                aria-label="Закрыть"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                            {sessionSummaries.length === 0 ? (
                                <p className="text-slate-400 text-sm">
                                    Саммари появятся для длинных диалогов: каждые 10 сообщений создаётся краткое содержание, которое подставляется в контекст модели вместо полной истории.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {sessionSummaries.map((s, i) => (
                                        <div
                                            key={s.chunkIndex}
                                            className="rounded-xl bg-slate-800/60 border border-slate-700/40 p-4"
                                        >
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                                Блок {i + 1} (сообщения 1–{(i + 1) * 10})
                                            </div>
                                            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                                                {s.content}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
