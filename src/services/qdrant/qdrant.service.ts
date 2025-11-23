/**
 * Qdrant Service
 * Manages all interactions with Qdrant vector database
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../../utils/logger.js';
import type {
  QdrantConfig,
  CodePoint,
  SearchResult,
  SearchOptions,
  SparseVector,
} from './types.js';

export class QdrantService {
  private client: QdrantClient;
  private collection: string;
  private embeddingModel: string;
  private embeddingType: string;
  private vectorSize: number;

  constructor(config?: QdrantConfig) {
    const url = config?.url || process.env.QDRANT_URL || 'http://54.37.225.188:6333';
    const apiKey = config?.apiKey || process.env.QDRANT_API_KEY;
    this.collection = config?.collection || process.env.QDRANT_COLLECTION || 'code_examples';
    this.embeddingModel = config?.embeddingModel || process.env.EMBEDDING_LLM_MODEL || 'openai/text-embedding-3-small';
    this.embeddingType = config?.embeddingType || process.env.EMBEDDING_TYPE || 'openai';
    this.vectorSize = config?.vectorSize || this.getVectorSizeForModel(this.embeddingModel);

    this.client = new QdrantClient({
      url,
      apiKey,
    });

    logger.info({
      url,
      collection: this.collection,
      embeddingModel: this.embeddingModel,
      embeddingType: this.embeddingType,
      vectorSize: this.vectorSize
    }, '🗄️ QdrantService initialized');
  }

  /**
   * Get vector size based on embedding model
   */
  private getVectorSizeForModel(model: string): number {
    // OpenAI models
    if (model.includes('text-embedding-3-large')) return 3072;
    if (model.includes('text-embedding-3-small') || model.includes('text-embedding-ada-002')) return 1536;
    if (model.includes('text-embedding-ada-001')) return 768;

    // Voyage AI models
    if (model.includes('voyage-3-large')) return 1024;
    if (model.includes('voyage-3')) return 1024;
    if (model.includes('voyage-2')) return 1024;
    if (model.includes('voyage-code-2')) return 1536;

    // Cohere models
    if (model.includes('embed-english-v3.0') || model.includes('embed-multilingual-v3.0')) return 1024;
    if (model.includes('embed-english-v2.0')) return 4096;
    if (model.includes('embed-english-light-v2.0')) return 1024;

    // Default fallback
    logger.warn({ model }, 'Unknown embedding model, using default vector size 1536');
    return 1536;
  }

  /**
   * Ensures collection exists, creates if not
   */
  async ensureCollectionExists(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collection);

      if (!exists) {
        await this.createCollection();
      } else {
        logger.info({ collection: this.collection }, '✅ Collection already exists');
      }
    } catch (error) {
      logger.error({ error }, '❌ Failed to check collection existence');
      throw error;
    }
  }

  /**
   * Creates collection with optimized configuration
   */
  private async createCollection(): Promise<void> {
    await this.client.createCollection(this.collection, {
      vectors: {
        // Dense vectors (semantic search)
        dense: {
          size: this.vectorSize, // Dynamic based on embedding model
          distance: 'Cosine',
          hnsw_config: {
            m: 16,
            ef_construct: 200,
          },
        },
      },
      // Sparse vectors configuration (lexical/BM25)
      sparse_vectors: {
        sparse: {},
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });

    logger.info({ collection: this.collection }, '✅ Collection created');
  }

  /**
   * Upserts a single point
   */
  async upsertPoint(point: CodePoint): Promise<void> {
    await this.client.upsert(this.collection, {
      points: [
        {
          id: point.id,
          vector: {
            dense: point.vector.dense,
            ...(point.vector.sparse && { sparse: point.vector.sparse }),
          },
          payload: point.payload,
        },
      ],
    });

    logger.debug({ id: point.id }, '✅ Point upserted');
  }

  /**
   * Upserts batch of points
   */
  async upsertBatch(points: CodePoint[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);

      await this.client.upsert(this.collection, {
        points: batch.map(p => ({
          id: p.id,
          vector: {
            dense: p.vector.dense,
            ...(p.vector.sparse && { sparse: p.vector.sparse }),
          },
          payload: p.payload,
        })),
      });

      logger.debug({ processed: i + batch.length, total: points.length }, '📦 Batch upserted');
    }
  }

  /**
   * Hybrid search (dense + sparse with RRF)
   */
  async searchHybrid(
    denseVector: number[],
    sparseVector?: SparseVector,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const topK = options?.topK || 5;

    // If no sparse vector, fall back to dense only
    if (!sparseVector || sparseVector.indices.length === 0) {
      return this.searchDense(denseVector, options);
    }

    try {
      // Hybrid search with RRF using prefetch
      const response = await this.client.query(this.collection, {
        query: denseVector,
        using: 'dense',
        limit: topK,
        filter: options?.filter,
        with_payload: true,
        prefetch: [
          {
            query: {
              indices: sparseVector.indices,
              values: sparseVector.values,
            },
            using: 'sparse',
            limit: topK * 2, // Get more from sparse for RRF
          },
        ],
      });

      return response.points.map(p => ({
        id: p.id as string,
        score: p.score || 0,
        payload: p.payload as CodePoint['payload'],
      }));
    } catch (error) {
      logger.warn({ error }, '⚠️ Hybrid search failed, falling back to dense only');
      return this.searchDense(denseVector, options);
    }
  }

  /**
   * Dense vector search only
   */
  async searchDense(
    denseVector: number[],
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const topK = options?.topK || 5;

    const response = await this.client.search(this.collection, {
      vector: {
        name: 'dense',
        vector: denseVector,
      },
      limit: topK,
      filter: options?.filter,
      with_payload: true,
    });

    return response.map(p => ({
      id: p.id as string,
      score: p.score,
      payload: p.payload as CodePoint['payload'],
    }));
  }

  /**
   * Deletes a point by ID
   */
  async deletePoint(id: string): Promise<void> {
    await this.client.delete(this.collection, {
      points: [id],
    });
  }

  /**
   * Deletes old points based on timestamp
   */
  async clearOldPoints(days: number): Promise<number> {
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const response = await this.client.delete(this.collection, {
      filter: {
        must: [
          {
            key: 'timestamp',
            range: {
              lt: cutoffDate,
            },
          },
        ],
      },
    });

    logger.info({ deleted: response, days }, '🗑️ Old points deleted');
    return response?.operation_id || 0;
  }

  /**
   * Gets collection statistics
   */
  async getStats(): Promise<any> {
    const info = await this.client.getCollection(this.collection);
    return {
      pointsCount: info.points_count,
      indexedVectorsCount: info.indexed_vectors_count,
      status: info.status,
    };
  }

  /**
   * Closes connection
   */
  close(): void {
    // QdrantClient doesn't require explicit close
    logger.info('👋 QdrantService closed');
  }
}
