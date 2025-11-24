/**
 * Embedding Service
 *
 * Generates vector embeddings for text using either:
 * - Local ONNX models (BGE-small-en-v1.5) - fast, free, private
 * - OpenRouter API (text-embedding-3-small) - good quality, paid
 *
 * Backend selection via EMBEDDING_BACKEND env var
 */
import type { IConfigurationService } from '../config/index.js';
export interface EmbeddingResult {
    embedding: number[];
    tokens: number;
    model: string;
    cost?: {
        currency: string;
        amount: number;
        details: {
            inputTokens: number;
            outputTokens: number;
            rate: number;
        };
    };
}
export interface EmbeddingOptions {
    model?: string;
    dimensions?: number;
}
export declare class EmbeddingService {
    private config;
    private apiKey;
    private baseURL;
    private defaultModel;
    private maxRetries;
    private backend;
    private localService;
    constructor(config?: IConfigurationService);
    /**
     * Retry helper with exponential backoff (API only)
     */
    private retryWithBackoff;
    /**
     * Validate embedding model availability
     */
    private validateEmbeddingModel;
    /**
     * Get available embedding models
     */
    getAvailableModels(): string[];
    /**
     * Generate embedding for a single text
     * Automatically uses local or API backend based on configuration
     */
    generateEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;
    /**
     * Generate embedding using local model (fast, free)
     */
    private generateLocalEmbedding;
    /**
     * Simple hash function for deterministic mock embeddings
     */
    private simpleHash;
    /**
     * Calculate embedding cost based on OpenRouter pricing
     */
    private calculateEmbeddingCost;
    /**
     * Generate embedding using API
     */
    private generateAPIEmbedding;
    /**
     * Generate embeddings for multiple texts in batch
     */
    generateBatchEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]>;
    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(a: number[], b: number[]): number;
    /**
     * Find most similar embeddings from a list
     */
    findMostSimilar(queryEmbedding: number[], candidates: Array<{
        embedding: number[];
        data: any;
    }>, topK?: number, threshold?: number): Array<{
        similarity: number;
        data: any;
    }>;
    /**
     * Get information about current configuration
     */
    getInfo(): {
        backend: string;
        model: string;
        dimensions: number;
    };
}
//# sourceMappingURL=embedding.service.d.ts.map