export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface ChatRequest {
  messages: Message[];
  model: string;
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
