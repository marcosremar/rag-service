/**
 * Embedding Types
 */

export interface DenseEmbedding {
  embedding: number[];
  tokens: number;
  model: string;
}

export interface SparseEmbedding {
  indices: number[];
  values: number[];
}

export interface HybridEmbedding {
  dense: DenseEmbedding;
  sparse: SparseEmbedding;
}
