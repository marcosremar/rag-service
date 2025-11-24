/**
 * Embedding Service
 *
 * Generates vector embeddings for text using either:
 * - Local ONNX models (BGE-small-en-v1.5) - fast, free, private
 * - OpenRouter API (text-embedding-3-small) - good quality, paid
 *
 * Backend selection via EMBEDDING_BACKEND env var
 */
import { defaultConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
export class EmbeddingService {
    config;
    apiKey;
    baseURL;
    defaultModel;
    maxRetries;
    backend;
    localService = null;
    constructor(config) {
        this.config = config || defaultConfig;
        this.backend = 'api'; // Forçado para API para teste
        this.apiKey = this.config.getEnv('OPENROUTER_API_KEY') || '';
        this.baseURL = this.config.getEnv('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1';
        this.defaultModel = this.config.getEnv('EMBEDDING_LLM_MODEL') || 'openai/text-embedding-3-small';
        this.maxRetries = parseInt(this.config.getEnv('RAG_MAX_RETRIES') || '3');
        // Initialize based on backend
        if (this.backend === 'local') {
            // For now, use a simple mock embedding that doesn't require external models
            logger.info({
                backend: 'local',
                model: 'mock-embeddings'
            }, '🧠 EmbeddingService initialized (LOCAL mode - mock embeddings for testing)');
        }
        else {
            // API mode (OpenRouter)
            if (!this.apiKey) {
                logger.warn('⚠️ OPENROUTER_API_KEY not configured');
                logger.warn('💡 Consider using EMBEDDING_BACKEND=local for free, fast embeddings');
                logger.warn('   Set EMBEDDING_BACKEND=local in .env to use local embeddings');
            }
            // Validate embedding model availability in OpenRouter
            this.validateEmbeddingModel(this.defaultModel);
            logger.info({
                backend: 'api',
                provider: 'OpenRouter',
                model: this.defaultModel,
                embeddingType: this.config.get('EMBEDDING_TYPE'),
                hasApiKey: !!this.apiKey
            }, '🧠 EmbeddingService initialized (API mode - OpenRouter)');
        }
    }
    /**
     * Retry helper with exponential backoff (API only)
     */
    async retryWithBackoff(fn, retries = this.maxRetries, delay = 1000) {
        try {
            return await fn();
        }
        catch (error) {
            if (retries === 0) {
                throw error;
            }
            // Check if error is retryable (network errors, 5xx, 429)
            const isRetryable = error.message?.includes('fetch failed') ||
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
     * Validate embedding model availability
     */
    validateEmbeddingModel(model) {
        // Common embedding models available on OpenRouter
        const availableModels = [
            // OpenAI
            'openai/text-embedding-3-small',
            'openai/text-embedding-3-large',
            'openai/text-embedding-ada-002',
            // Voyage AI
            'voyageai/voyage-3-large',
            'voyageai/voyage-3',
            'voyageai/voyage-2',
            'voyageai/voyage-code-2',
            // Cohere
            'cohere/embed-english-v3.0',
            'cohere/embed-multilingual-v3.0',
            'cohere/embed-english-v2.0',
            'cohere/embed-english-light-v2.0',
        ];
        if (!availableModels.includes(model)) {
            logger.warn({
                model,
                availableModels
            }, '⚠️ Model may not be available on OpenRouter. Check https://openrouter.ai/models');
        }
    }
    /**
     * Get available embedding models
     */
    getAvailableModels() {
        return [
            'openai/text-embedding-3-small', // 1536 dims, fast & good
            'openai/text-embedding-3-large', // 3072 dims, best quality
            'openai/text-embedding-ada-002', // 1536 dims, legacy
            'voyageai/voyage-3-large', // 1024 dims, good for code
            'voyageai/voyage-code-2', // 1536 dims, specialized for code
            'cohere/embed-english-v3.0', // 1024 dims, good quality
        ];
    }
    /**
     * Generate embedding for a single text
     * Automatically uses local or API backend based on configuration
     */
    async generateEmbedding(text, options) {
        if (this.backend === 'local') {
            return this.generateLocalEmbedding(text);
        }
        else {
            return this.generateAPIEmbedding(text, options);
        }
    }
    /**
     * Generate embedding using local model (fast, free)
     */
    async generateLocalEmbedding(text) {
        // Simple mock embedding: create a deterministic vector based on text hash
        // Match Qdrant collection size (1536 for text-embedding-3-small)
        const vectorSize = 1536;
        const hash = this.simpleHash(text);
        const embedding = Array.from({ length: vectorSize }, (_, i) => Math.sin(hash + i) * 0.1 + Math.cos(hash * 2 + i) * 0.05);
        const tokens = Math.ceil(text.length / 4);
        const cost = this.calculateEmbeddingCost('mock-embedding-v1', tokens);
        return {
            embedding,
            tokens,
            model: 'mock-embedding-v1',
            cost,
        };
    }
    /**
     * Simple hash function for deterministic mock embeddings
     */
    simpleHash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }
    /**
     * Calculate embedding cost based on OpenRouter pricing
     */
    calculateEmbeddingCost(model, tokens) {
        // OpenRouter pricing as of 2024
        const pricing = {
            'openai/text-embedding-3-small': 0.02 / 1000000, // $0.02 per 1M tokens
            'openai/text-embedding-3-large': 0.13 / 1000000, // $0.13 per 1M tokens
            'openai/text-embedding-ada-002': 0.10 / 1000000, // $0.10 per 1M tokens
            'mock-embedding-v1': 0, // Free local embeddings
        };
        const rate = pricing[model] ?? 0; // Default to 0 for unknown models
        const amount = tokens * rate;
        const costResult = {
            currency: 'USD',
            amount: Math.round(amount * 1000000) / 1000000, // Round to 6 decimal places
            details: {
                inputTokens: tokens,
                outputTokens: 0, // Embeddings don't have output tokens
                rate: rate,
            },
        };
        console.log('DEBUG: Cost calculation result:', costResult);
        return costResult;
    }
    /**
     * Generate embedding using API
     */
    async generateAPIEmbedding(text, options) {
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY must be configured for API embedding backend');
        }
        const model = options?.model || this.defaultModel;
        return this.retryWithBackoff(async () => {
            try {
                const url = `${this.baseURL}/embeddings`;
                const requestBody = {
                    model,
                    input: text,
                    ...(options?.dimensions && { dimensions: options.dimensions }),
                };
                logger.debug({ url, model, textLength: text.length }, 'Requesting embedding from API');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://github.com/code-agent',
                    },
                    body: JSON.stringify(requestBody),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error({
                        status: response.status,
                        statusText: response.statusText,
                        error: errorText,
                        url,
                    }, '❌ Embedding API returned error');
                    throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
                }
                const data = await response.json();
                logger.debug({
                    model,
                    textLength: text.length,
                    tokens: data.usage?.total_tokens,
                    dimensions: data.data[0].embedding.length,
                }, '✅ Embedding generated (API)');
                // Calculate cost based on OpenRouter pricing
                const tokens = data.usage?.total_tokens || 0;
                const cost = this.calculateEmbeddingCost(model, tokens);
                return {
                    embedding: data.data[0].embedding,
                    tokens,
                    model,
                    cost,
                };
            }
            catch (error) {
                const errorDetails = {
                    message: error.message,
                    code: error.code,
                    errno: error.errno,
                    syscall: error.syscall,
                    path: error.path,
                    text: text.substring(0, 100),
                };
                logger.error(errorDetails, '❌ Failed to generate API embedding');
                // Provide more specific error messages
                if (error.code === 'ConnectionRefused' || error.code === 'ECONNREFUSED') {
                    throw new Error(`Cannot connect to OpenRouter API at ${this.baseURL}/embeddings. Please check your network connection and API configuration.`);
                }
                else if (error.message?.includes('401')) {
                    throw new Error('Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY configuration.');
                }
                else if (error.message?.includes('429')) {
                    throw new Error('OpenRouter API rate limit exceeded. Please try again later.');
                }
                throw error;
            }
        });
    }
    /**
     * Generate embeddings for multiple texts in batch
     */
    async generateBatchEmbeddings(texts, options) {
        if (this.backend === 'local' && this.localService) {
            // Use optimized batch processing for local embeddings
            try {
                const embeddings = await this.localService.generateBatchEmbeddings(texts);
                return embeddings.map((emb, index) => ({
                    embedding: this.localService.toArray(emb),
                    tokens: Math.ceil(texts[index].length / 4),
                    model: this.localService.getModelInfo().model,
                    cost: {
                        currency: 'USD',
                        amount: 0,
                        details: {
                            inputTokens: Math.ceil(texts[index].length / 4),
                            outputTokens: 0,
                            rate: 0,
                        },
                    },
                }));
            }
            catch (error) {
                logger.error({ error, count: texts.length }, '❌ Failed to generate batch local embeddings');
                throw error;
            }
        }
        else {
            // API batch processing
            const results = [];
            // Process in batches of 10 to avoid rate limits
            const batchSize = 10;
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(text => this.generateEmbedding(text, options)));
                results.push(...batchResults);
            }
            return results;
        }
    }
    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have same dimensions');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * Find most similar embeddings from a list
     */
    findMostSimilar(queryEmbedding, candidates, topK = 3, threshold = 0.7) {
        const similarities = candidates.map(candidate => ({
            similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding),
            data: candidate.data,
        }));
        return similarities
            .filter(item => item.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    }
    /**
     * Get information about current configuration
     */
    getInfo() {
        if (this.backend === 'local' && this.localService) {
            const info = this.localService.getModelInfo();
            return {
                backend: 'local',
                model: info.model,
                dimensions: info.expectedDimensions
            };
        }
        else {
            return {
                backend: 'api',
                model: this.defaultModel,
                dimensions: this.defaultModel.includes('3-small') ? 1536 :
                    this.defaultModel.includes('3-large') ? 3072 :
                        this.defaultModel.includes('voyage-code-3') ? 1024 : 1536
            };
        }
    }
}
//# sourceMappingURL=embedding.service.js.map