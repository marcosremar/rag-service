/**
 * Qdrant Service
 * Manages all interactions with Qdrant vector database
 */
import type { QdrantConfig, CodePoint, SearchResult, SearchOptions, SparseVector } from './types.js';
export declare class QdrantService {
    private client;
    private collection;
    private embeddingModel;
    private embeddingType;
    private vectorSize;
    constructor(config?: QdrantConfig);
    /**
     * Get vector size based on embedding model
     */
    private getVectorSizeForModel;
    /**
     * Ensures collection exists, creates if not
     */
    ensureCollectionExists(): Promise<void>;
    /**
     * Creates collection with optimized configuration
     */
    private createCollection;
    /**
     * Upserts a single point
     */
    upsertPoint(point: CodePoint): Promise<void>;
    /**
     * Upserts batch of points
     */
    upsertBatch(points: CodePoint[]): Promise<void>;
    /**
     * Hybrid search (dense + sparse with RRF)
     */
    searchHybrid(denseVector: number[], sparseVector?: SparseVector, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Dense vector search only
     */
    searchDense(denseVector: number[], options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Deletes a point by ID
     */
    deletePoint(id: string): Promise<void>;
    /**
     * Deletes old points based on timestamp
     */
    clearOldPoints(days: number): Promise<number>;
    /**
     * Gets collection statistics
     */
    getStats(): Promise<any>;
    /**
     * Closes connection
     */
    close(): void;
}
//# sourceMappingURL=qdrant.service.d.ts.map