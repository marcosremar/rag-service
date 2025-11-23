/**
 * Tipos para o sistema de Prompt Builder
 */

/**
 * Contexto passado para componentes de prompt
 */
export interface PromptContext {
  // Token information
  currentInputTokens: number;
  maxTokens: number; // Total context window (input + output)
  remainingTokens: number; // Remaining in context window
  maxOutputTokens: number; // Model-specific max output limit

  // Model information
  model: string;
  tier: 'primary' | 'secondary' | 'fast';

  // Configuration
  config: PromptConfig;

  // Custom instructions
  customInstructions?: string;

  // Continuation support
  continuationState?: {
    canContinue: boolean;
    previousOutputTokens: number;
    isPartialOutput: boolean;
  };

  // Current working directory
  cwd: string;

  // Project root for file generation context
  projectRoot?: string;

  // Multi-model enabled
  multiModelEnabled: boolean;
}

/**
 * Interface para componentes de prompt
 */
export interface IPromptComponent {
  /**
   * Constrói a seção do prompt
   */
  build(context: PromptContext): string;

  /**
   * Prioridade de injeção (menor = primeiro)
   * 0-99: System prompts base
   * 100-199: Context awareness (tokens, etc)
   * 200-299: Instructions e rules
   * 300-399: Custom additions
   */
  priority: number;

  /**
   * Se o componente deve ser incluído no prompt
   */
  enabled(context: PromptContext): boolean;

  /**
   * Nome do componente (para debugging)
   */
  name: string;
}

/**
 * Configuração de prompt (vem de arquivo)
 */
export interface PromptConfig {
  // Token awareness
  tokenAwareness: {
    enabled: boolean;
    lowThreshold: number;        // Default: 1000 tokens
    criticalThreshold: number;   // Default: 500 tokens
    maxOutputPercentage: number; // Default: 0.8 (80%)
  };

  // Continuation
  continuation: {
    enabled: boolean;
    autoPrompt: boolean; // Auto-sugerir continuação quando truncado
  };

  // Output limits
  outputLimits: {
    // Quando gerar arquivos, avisar se vai ultrapassar
    warnOnLargeFile: boolean;
    largeFileThreshold: number; // tokens
  };
}
