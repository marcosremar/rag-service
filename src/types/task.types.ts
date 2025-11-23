import type { LLMMessage } from '../llm/api-client.js';

export enum TaskComplexity {
  SIMPLE = 'simple',
  MEDIUM = 'medium',
  COMPLEX = 'complex',
}

export interface TaskClassificationInput {
  userMessage: string;
  conversationHistory?: LLMMessage[];
}

export interface TaskClassificationResult {
  complexity: TaskComplexity;
  confidence: number;
  matchedKeywords: string[];
  reasons: string[];
}
