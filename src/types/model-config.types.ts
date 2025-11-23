/**
 * Model configuration types for token limits and capabilities
 */

export interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface ModelCapabilities {
  functionCalling: boolean;
  streaming: boolean;
  longContext: boolean;
}

export interface ModelNotes {
  nativeContext?: number;
  extendedWith?: string;
  recommendedMaxOutput?: number;
  extendedMaxOutput?: number;
}

export interface ModelConfig {
  name: string;
  provider: string;
  contextWindow: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  description: string;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  notes?: ModelNotes;
}

export interface FallbackConfig {
  contextWindow: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  description: string;
}

export interface ModelsConfiguration {
  models: Record<string, ModelConfig>;
  fallback: FallbackConfig;
}
