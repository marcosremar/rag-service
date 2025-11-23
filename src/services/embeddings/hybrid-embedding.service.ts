/**
 * Hybrid Embedding Service
 * Generates both dense (semantic) and sparse (lexical) embeddings
 * Supports both API-based and local embedding models
 */

import { logger } from '../../utils/logger.js';
import { LocalEmbeddingService } from './local-embedding.service.js';
import type { DenseEmbedding, SparseEmbedding, HybridEmbedding } from './types.js';

export class HybridEmbeddingService {
  private apiKey: string;
  private baseURL: string;
  private denseModel: string;
  private maxRetries: number;
  private backend: 'api' | 'local';
  private localService: LocalEmbeddingService | null = null;

  constructor() {
    this.backend = (process.env.EMBEDDING_BACKEND || 'api') as 'api' | 'local';
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.denseModel = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';
    this.maxRetries = parseInt(process.env.RAG_MAX_RETRIES || '3');

    // Initialize based on backend
    if (this.backend === 'local') {
      this.localService = new LocalEmbeddingService();
      logger.info({
        backend: 'local',
        model: process.env.LOCAL_EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5'
      }, '🧠 HybridEmbeddingService initialized (LOCAL mode - fast & free!)');
    } else {
      if (!this.apiKey) {
        logger.warn('⚠️ OPENROUTER_API_KEY not configured, will fail if API backend is used');
        logger.warn('💡 Consider using EMBEDDING_BACKEND=local for free, fast embeddings');
      }
      logger.info({
        backend: 'api',
        denseModel: this.denseModel
      }, '🧠 HybridEmbeddingService initialized (API mode)');
    }
  }

  /**
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.maxRetries,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (retries === 0) {
        throw error;
      }

      const isRetryable =
        error.message?.includes('fetch failed') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('429') ||
        error.message?.includes('5');

      if (!isRetryable) {
        throw error;
      }

      logger.warn({
        retriesLeft: retries - 1,
        delayMs: delay,
        error: error.message
      }, '⚠️ Retrying embedding API call');

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  /**
   * Generates dense embedding (semantic)
   * Uses either API or local model based on backend configuration
   */
  async generateDenseEmbedding(text: string): Promise<DenseEmbedding> {
    if (this.backend === 'local') {
      return this.generateLocalDenseEmbedding(text);
    } else {
      return this.generateApiDenseEmbedding(text);
    }
  }

  /**
   * Generates dense embedding using local model (fast, free)
   */
  private async generateLocalDenseEmbedding(text: string): Promise<DenseEmbedding> {
    if (!this.localService) {
      throw new Error('Local embedding service not initialized');
    }

    try {
      const embedding = await this.localService.generateEmbedding(text);

      return {
        embedding: this.localService.toArray(embedding),
        tokens: 0, // No API tokens used
        model: this.localService.getModelInfo().model,
      };
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100) }, '❌ Failed to generate local dense embedding');
      throw error;
    }
  }

  /**
   * Generates dense embedding using API
   */
  private async generateApiDenseEmbedding(text: string): Promise<DenseEmbedding> {
    return this.retryWithBackoff(async () => {
      try {
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/code-agent',
          },
          body: JSON.stringify({
            model: this.denseModel,
            input: text,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Embedding API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as {
          data: Array<{ embedding: number[] }>;
          usage?: { total_tokens?: number };
        };

        logger.debug({
          model: this.denseModel,
          textLength: text.length,
          tokens: data.usage?.total_tokens,
          dimensions: data.data[0].embedding.length,
        }, '✅ Dense embedding generated (API)');

        return {
          embedding: data.data[0].embedding,
          tokens: data.usage?.total_tokens || 0,
          model: this.denseModel,
        };
      } catch (error) {
        logger.error({ error, text: text.substring(0, 100) }, '❌ Failed to generate API dense embedding');
        throw error;
      }
    });
  }

  /**
   * Generates sparse embedding (lexical/BM25-like)
   * Using simple TF-IDF implementation
   */
  generateSparseEmbedding(text: string): SparseEmbedding {
    // Tokenize - split on non-alphanumeric, keep camelCase and snake_case
    const tokens = this.tokenize(text);

    // Calculate term frequencies
    const termFreq = new Map<string, number>();
    tokens.forEach(token => {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    });

    // Create sparse vectors
    const indices: number[] = [];
    const values: number[] = [];

    Array.from(termFreq.entries()).forEach(([term, freq]) => {
      // Hash term to create index
      const hash = this.hashString(term);
      indices.push(hash);

      // Simple TF (could be enhanced with IDF)
      const tf = freq / tokens.length;
      values.push(tf);
    });

    logger.debug({
      textLength: text.length,
      uniqueTerms: indices.length,
      totalTokens: tokens.length,
    }, '✅ Sparse embedding generated');

    return { indices, values };
  }

  /**
   * Tokenizes text preserving code-specific patterns
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // Extract camelCase words
    const camelCaseMatches = text.match(/[a-z]+[A-Z][a-z]+/g) || [];
    camelCaseMatches.forEach(match => {
      // Split camelCase into parts
      const parts = match.split(/(?=[A-Z])/);
      tokens.push(...parts.map(p => p.toLowerCase()));
    });

    // Extract snake_case words
    const snakeCaseMatches = text.match(/[a-z]+_[a-z]+/g) || [];
    snakeCaseMatches.forEach(match => {
      tokens.push(...match.split('_'));
    });

    // General tokenization
    const generalTokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2); // Filter short tokens

    tokens.push(...generalTokens);

    return tokens;
  }

  /**
   * Hashes string to create index
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100000; // Limit to 100k dimensions
  }

  /**
   * Generates both dense and sparse embeddings
   */
  async generateHybridEmbedding(text: string): Promise<HybridEmbedding> {
    const [dense, sparse] = await Promise.all([
      this.generateDenseEmbedding(text),
      Promise.resolve(this.generateSparseEmbedding(text)),
    ]);

    return { dense, sparse };
  }

  /**
   * Batch processing
   */
  async generateBatchHybrid(texts: string[]): Promise<HybridEmbedding[]> {
    const batchSize = parseInt(process.env.RAG_BATCH_SIZE || '10');
    const results: HybridEmbedding[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.generateHybridEmbedding(text))
      );
      results.push(...batchResults);

      logger.debug({ processed: i + batch.length, total: texts.length }, '📦 Batch processed');
    }

    return results;
  }

  /**
   * Get information about current configuration
   */
  getInfo(): {
    backend: string;
    model: string;
    dimensions: number;
  } {
    if (this.backend === 'local' && this.localService) {
      const info = this.localService.getModelInfo();
      return {
        backend: 'local',
        model: info.model,
        dimensions: info.expectedDimensions
      };
    } else {
      return {
        backend: 'api',
        model: this.denseModel,
        dimensions: this.denseModel.includes('3-small') ? 1536 :
                   this.denseModel.includes('3-large') ? 3072 :
                   this.denseModel.includes('voyage-code-3') ? 1024 : 1536
      };
    }
  }
}
