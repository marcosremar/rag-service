/**
 * RAG Service (Retrieval-Augmented Generation)
 * Centralized service for semantic search and code retrieval
 * Provides embeddings, vector search, and RAG capabilities to all services
 */

import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { createServiceLogger } from './utils/service-logger.js';
const logger = createServiceLogger('rag-service');

import { CodeRetrievalService } from './services/code-retrieval.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { QdrantService } from './services/qdrant/qdrant.service.js';
import { sanitizeErrorForResponse } from './utils/log-sanitizer.js';
import { defaultConfig } from './config/index.js';

const PORT = parseInt(process.env.PORT || '3120', 10);
const HOST = process.env.HOST || '0.0.0.0';

let app: FastifyInstance;
let codeRetrievalService: CodeRetrievalService;
let embeddingService: EmbeddingService;
let qdrantService: QdrantService;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Initialize RAG services
  logger.info('Initializing RAG services...');

  embeddingService = new EmbeddingService();
  qdrantService = new QdrantService();
  codeRetrievalService = new CodeRetrievalService();

  // Initialize async components
  await codeRetrievalService.initialize();

  logger.info('✅ RAG services initialized');

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'rag-service',
      components: {
        embedding: 'ready',
        vectorDb: 'ready',
        codeRetrieval: 'ready'
      },
      config: {
        embeddingModel: defaultConfig.get('EMBEDDING_LLM_MODEL'),
        embeddingType: defaultConfig.get('EMBEDDING_TYPE'),
        vectorDatabase: defaultConfig.get('VECTOR_DATABASE'),
        topK: defaultConfig.get('RAG_TOP_K'),
        threshold: defaultConfig.get('RAG_SIMILARITY_THRESHOLD')
      }
    };
  });

  // Models endpoint - list available embedding models
  fastify.get('/models', async () => {
    const { EmbeddingService } = await import('./services/embedding.service.js');
    const embeddingService = new EmbeddingService();

    return {
      availableModels: embeddingService.getAvailableModels(),
      currentModel: defaultConfig.get('EMBEDDING_LLM_MODEL'),
      embeddingType: defaultConfig.get('EMBEDDING_TYPE'),
      vectorDatabase: defaultConfig.get('VECTOR_DATABASE')
    };
  });

  // Configuration endpoint
  fastify.post('/configure', async (request, reply) => {
    const config = request.body as any;

    try {
      // Update configuration
      if (config.llmModel) defaultConfig.set('EMBEDDING_LLM_MODEL', config.llmModel);
      if (config.embeddingType) defaultConfig.set('EMBEDDING_TYPE', config.embeddingType);
      if (config.database) defaultConfig.set('VECTOR_DATABASE', config.database);
      if (config.topK) defaultConfig.set('RAG_TOP_K', config.topK);
      if (config.threshold) defaultConfig.set('RAG_SIMILARITY_THRESHOLD', config.threshold);

      logger.info({ config }, '🔧 RAG service configuration updated');

      return {
        success: true,
        message: 'Configuration updated successfully',
        currentConfig: {
          embeddingModel: defaultConfig.get('EMBEDDING_LLM_MODEL'),
          embeddingType: defaultConfig.get('EMBEDDING_TYPE'),
          vectorDatabase: defaultConfig.get('VECTOR_DATABASE'),
          topK: defaultConfig.get('RAG_TOP_K'),
          threshold: defaultConfig.get('RAG_SIMILARITY_THRESHOLD')
        }
      };
    } catch (error: any) {
      logger.error({ error, config }, '❌ Failed to update configuration');
      return reply.code(500).send({
        error: 'Failed to update configuration',
        details: error.message
      });
    }
  });

  // Store code example for RAG training
  fastify.post<{
    Body: {
      task: string;
      code: string;
      language: string;
      framework?: string;
      tool: string;
      success: boolean;
      errorMessage?: string;
    };
  }>('/store', async (request, reply) => {
    const startTime = Date.now();

    try {
      const { task, code, language, framework, tool, success, errorMessage } = request.body;

      if (!task || !code || !language || !tool) {
        return reply.code(400).send({
          error: 'Missing required fields: task, code, language, tool'
        });
      }

      const exampleId = await codeRetrievalService.storeExample({
        task,
        code,
        language,
        framework,
        tool,
        success: success !== false, // default to true
        errorMessage
      });

      logger.info({ exampleId, language, tool }, 'Code example stored for RAG');

      return {
        success: true,
        exampleId,
        processingTime: Date.now() - startTime
      };
    } catch (error: unknown) {
      const sanitized = sanitizeErrorForResponse(error);
      logger.error({ error: sanitized }, 'Failed to store code example');
      return reply.code(500).send({ error: 'Internal Server Error', details: sanitized });
    }
  });

  // Retrieve similar examples for RAG augmentation
  fastify.post<{
    Body: {
      task: string;
      language?: string;
      tool?: string;
      topK?: number;
      threshold?: number;
    };
  }>('/retrieve', async (request, reply) => {
    const startTime = Date.now();

    try {
      const { task, language, tool, topK = 3, threshold = 0.6 } = request.body;

      if (!task) {
        return reply.code(400).send({ error: 'task is required' });
      }

      const results = await codeRetrievalService.retrieveSimilarExamples(task, {
        language,
        tool,
        topK,
        threshold
      });

      logger.info({
        query: task.substring(0, 50) + '...',
        resultsCount: results.length,
        language,
        tool
      }, 'RAG retrieval completed');

      return {
        success: true,
        results,
        processingTime: Date.now() - startTime
      };
    } catch (error: unknown) {
      const sanitized = sanitizeErrorForResponse(error);
      logger.error({ error: sanitized }, 'Failed to retrieve examples');
      return reply.code(500).send({ error: 'Internal Server Error', details: sanitized });
    }
  });

  // Search in vector database
  fastify.post<{
    Body: {
      query: string;
      topK?: number;
      filter?: any;
    };
  }>('/search', async (request, reply) => {
    const startTime = Date.now();

    try {
      const { query, topK = 5, filter } = request.body;

      if (!query) {
        return reply.code(400).send({ error: 'query is required' });
      }

      // Generate embedding for the query
      const { embedding } = await embeddingService.generateEmbedding(query);

      // Search in vector database
      const results = await qdrantService.searchDense(embedding, { topK, filter });

      logger.info({
        query: query.substring(0, 50) + '...',
        resultsCount: results.length
      }, 'Vector search completed');

      return {
        success: true,
        results,
        processingTime: Date.now() - startTime
      };
    } catch (error: unknown) {
      const sanitized = sanitizeErrorForResponse(error);
      logger.error({ error: sanitized }, 'Failed to perform vector search');
      return reply.code(500).send({ error: 'Internal Server Error', details: sanitized });
    }
  });

  // Hybrid search (dense + sparse vectors)
  fastify.post<{
    Body: {
      query: string;
      topK?: number;
      filter?: any;
    };
  }>('/hybrid-search', async (request, reply) => {
    const startTime = Date.now();

    try {
      const { query, topK = 5, filter } = request.body;

      if (!query) {
        return reply.code(400).send({ error: 'query is required' });
      }

      // Generate dense embedding
      const { embedding: denseVector } = await embeddingService.generateEmbedding(query);

      // For now, use dense-only search (sparse vectors would need additional setup)
      const results = await qdrantService.searchDense(denseVector, { topK, filter });

      logger.info({
        query: query.substring(0, 50) + '...',
        resultsCount: results.length
      }, 'Hybrid search completed');

      return {
        success: true,
        results,
        processingTime: Date.now() - startTime,
        note: 'Currently using dense-only search. Sparse vectors can be added for full hybrid search.'
      };
    } catch (error: unknown) {
      const sanitized = sanitizeErrorForResponse(error);
      logger.error({ error: sanitized }, 'Failed to perform hybrid search');
      return reply.code(500).send({ error: 'Internal Server Error', details: sanitized });
    }
  });

  // Generate embeddings for text
  fastify.post<{
    Body: {
      text: string;
      model?: string;
      options?: {
        dimensions?: number;
      };
    };
  }>('/embed', async (request, reply) => {
    const startTime = Date.now();

    try {
      const { text, model, options } = request.body;

      if (!text) {
        return reply.code(400).send({ error: 'text is required' });
      }

      if (text.length > 8192) {
        return reply.code(400).send({ error: 'Text too long. Maximum 8192 characters.' });
      }

      // Generate embedding
      const result = await embeddingService.generateEmbedding(text, {
        model,
        dimensions: options?.dimensions
      });

      logger.info({
        textLength: text.length,
        model: result.model,
        tokens: result.tokens,
        dimensions: result.embedding.length,
        cost: result.cost
      }, 'Embedding generated successfully');


      return {
        success: true,
        embedding: result.embedding,
        tokens: result.tokens,
        model: result.model,
        dimensions: result.embedding.length,
        processingTime: Date.now() - startTime,
        cost: result.cost
      };
    } catch (error: unknown) {
      const sanitized = sanitizeErrorForResponse(error);
      logger.error({ error: sanitized, textLength: request.body?.text?.length }, 'Failed to generate embedding');
      return reply.code(500).send({ error: 'Internal Server Error', details: sanitized });
    }
  });

  return fastify;
}

const start = async () => {
  try {
    app = await buildApp();
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, host: HOST }, 'RAG Service started successfully');
  } catch (err) {
    logger.error({ error: err }, 'Failed to start RAG Service');
    process.exit(1);
  }
};

start();
