/**
 * Qdrant Types
 * Type definitions for Qdrant vector database integration
 */
export interface QdrantConfig {
    url: string;
    apiKey?: string;
    collection: string;
    embeddingModel?: string;
    embeddingType?: string;
    vectorSize?: number;
}
export interface SparseVector {
    indices: number[];
    values: number[];
}
export interface CodePoint {
    id: string;
    vector: {
        dense: number[];
        sparse?: SparseVector;
    };
    payload: {
        task: string;
        code: string;
        chunkType: 'function' | 'class' | 'import' | 'full_file';
        language: string;
        framework?: string;
        filePath?: string;
        imports: string[];
        exports: string[];
        patterns: string[];
        success: boolean;
        tool: string;
        timestamp: number;
        codeHash: string;
        [key: string]: any;
    };
}
export interface SearchResult {
    id: string;
    score: number;
    payload: CodePoint['payload'];
}
export interface SearchOptions {
    topK?: number;
    filter?: any;
}
//# sourceMappingURL=types.d.ts.map