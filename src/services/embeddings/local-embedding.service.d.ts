/**
 * Local Embedding Service
 * Fast, free embeddings using ONNX models via transformers.js
 * Uses BGE-small-en-v1.5 by default (384 dimensions, ~10-50ms)
 */
export declare class LocalEmbeddingService {
    private extractor;
    private model;
    private quantized;
    private initialized;
    constructor();
    /**
     * Initialize the model (lazy loading)
     */
    initialize(): Promise<void>;
    /**
     * Generate embedding for a single text
     */
    generateEmbedding(text: string): Promise<Float32Array>;
    /**
     * Generate embeddings for multiple texts (batch)
     * More efficient than individual calls
     */
    generateBatchEmbeddings(texts: string[]): Promise<Float32Array[]>;
    /**
     * Convert Float32Array to regular number array
     */
    toArray(embedding: Float32Array): number[];
    /**
     * Get model info
     */
    getModelInfo(): {
        model: string;
        quantized: boolean;
        initialized: boolean;
        expectedDimensions: number;
    };
    /**
     * Get expected dimensions based on model
     */
    private getExpectedDimensions;
    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number;
}
//# sourceMappingURL=local-embedding.service.d.ts.map