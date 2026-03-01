export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export type ContextStrategy = 'sliding_window' | 'sticky_facts' | 'branching';

export interface ChatRequest {
  messages: Message[];
  model: string;
  sessionId?: string | null;
  contextStrategy?: ContextStrategy;
  windowSize?: number;
  branchId?: string | null;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  max_tokens?: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
