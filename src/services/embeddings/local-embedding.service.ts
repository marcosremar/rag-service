/**
 * Local Embedding Service
 * Fast, free embeddings using ONNX models via transformers.js
 * Uses BGE-small-en-v1.5 by default (384 dimensions, ~10-50ms)
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { logger } from '../../utils/logger.js';

export class LocalEmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private model: string;
  private quantized: boolean;
  private initialized: boolean = false;

  constructor() {
    this.model = process.env.LOCAL_EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5';
    this.quantized = process.env.LOCAL_EMBEDDING_QUANTIZED !== 'false'; // Default true

    logger.info({
      model: this.model,
      quantized: this.quantized
    }, '🧠 LocalEmbeddingService created (lazy init)');
  }

  /**
   * Initialize the model (lazy loading)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info({ model: this.model }, '📥 Loading local embedding model...');
    const startTime = Date.now();

    try {
      this.extractor = await pipeline('feature-extraction', this.model, {
        quantized: this.quantized,
      });

      this.initialized = true;
      const elapsed = Date.now() - startTime;

      logger.info({
        model: this.model,
        quantized: this.quantized,
        loadTimeMs: elapsed
      }, '✅ Local embedding model loaded');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      logger.error({
        error: {
          message: errorMessage,
          name: errorName,
          stack: errorStack,
          raw: error
        },
        model: this.model,
        quantized: this.quantized,
        nodeVersion: process.version
      }, '❌ Failed to load local embedding model');

      throw new Error(
        `Failed to load local embedding model "${this.model}": ${errorMessage}. ` +
        `Ensure @xenova/transformers is installed and compatible with Node ${process.version}. ` +
        `Try setting LOCAL_EMBEDDING_MODEL to a different model or use API-based embeddings.`
      );
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.extractor) {
      throw new Error('Extractor not initialized');
    }

    const startTime = Date.now();

    try {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true
      });

      const elapsed = Date.now() - startTime;

      // Convert to Float32Array if needed
      const embedding = output.data instanceof Float32Array ?
        output.data :
        new Float32Array(output.data as number[]);

      logger.debug({
        textLength: text.length,
        dimensions: embedding.length,
        latencyMs: elapsed
      }, '✅ Local embedding generated');

      return embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined
        },
        text: text.substring(0, 100),
        textLength: text.length,
        model: this.model
      }, '❌ Failed to generate local embedding');
      throw new Error(`Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * More efficient than individual calls
   */
  async generateBatchEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.extractor) {
      throw new Error('Extractor not initialized');
    }

    const startTime = Date.now();

    try {
      // Process in smaller batches to avoid memory issues
      const batchSize = 32;
      const results: Float32Array[] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const outputs = await this.extractor(batch, {
          pooling: 'mean',
          normalize: true
        });

        // Extract embeddings from batch output
        if (Array.isArray(outputs)) {
          outputs.forEach(output => {
            const emb = output.data instanceof Float32Array ?
              output.data :
              new Float32Array(output.data as number[]);
            results.push(emb);
          });
        } else {
          // Single output
          const emb = outputs.data instanceof Float32Array ?
            outputs.data :
            new Float32Array(outputs.data as number[]);
          results.push(emb);
        }
      }

      const elapsed = Date.now() - startTime;
      const avgLatency = elapsed / texts.length;

      logger.debug({
        count: texts.length,
        totalMs: elapsed,
        avgMs: avgLatency.toFixed(2),
        dimensions: results[0]?.length
      }, '✅ Batch embeddings generated');

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined
        },
        count: texts.length,
        model: this.model,
        batchSize: 32
      }, '❌ Failed to generate batch embeddings');
      throw new Error(`Failed to generate batch embeddings: ${errorMessage}`);
    }
  }

  /**
   * Convert Float32Array to regular number array
   */
  toArray(embedding: Float32Array): number[] {
    return Array.from(embedding);
  }

  /**
   * Get model info
   */
  getModelInfo(): {
    model: string;
    quantized: boolean;
    initialized: boolean;
    expectedDimensions: number;
  } {
    return {
      model: this.model,
      quantized: this.quantized,
      initialized: this.initialized,
      expectedDimensions: this.getExpectedDimensions()
    };
  }

  /**
   * Get expected dimensions based on model
   */
  private getExpectedDimensions(): number {
    if (this.model.includes('bge-small')) return 384;
    if (this.model.includes('bge-base')) return 768;
    if (this.model.includes('bge-large')) return 1024;
    if (this.model.includes('nomic-embed-text')) return 768;
    return 384; // Default
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
    const dotProduct = Array.from(a).reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(Array.from(a).reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(Array.from(b).reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
