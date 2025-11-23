/**
 * Code Retrieval Service (RAG)
 *
 * Implements Retrieval-Augmented Generation for code examples
 * Based on DLCodeGen paper (arXiv:2504.15080)
 *
 * Features:
 * - Stores successful code examples with embeddings
 * - Retrieves similar examples for new tasks
 * - Augments prompts with relevant examples
 */

import { EmbeddingService } from './embedding.service.js';
import { QdrantService } from './qdrant/qdrant.service.js';
import type { IConfigurationService } from '../config/index.js';
import { defaultConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { join } from 'path';
import type { CodePoint } from './qdrant/types.js';

// Use bun:sqlite exclusively
import { Database } from 'bun:sqlite';

export interface CodeExample {
  id?: number;
  task: string;
  code: string;
  language: string;
  framework?: string;
  tool: string;
  success: boolean;
  embedding: number[];
  timestamp: Date;
  errorMessage?: string;  // For failed attempts
  errorType?: string;      // Type of error (syntax, runtime, logic, etc)
}

export interface RetrievalResult {
  example: Omit<CodeExample, 'embedding'>;  // Qdrant doesn't return embeddings
  similarity: number;
}

export class CodeRetrievalService {
  private embeddingService: EmbeddingService;
  private qdrantService: QdrantService;
  private db: Database;
  private config: IConfigurationService;
  public static rootDir: string | null = null;

  constructor(config?: IConfigurationService, rootDir?: string) {
    this.config = config || defaultConfig;
    this.embeddingService = new EmbeddingService(config);
    this.qdrantService = new QdrantService({
      url: this.config.get('QDRANT_URL'),
      collection: this.config.get('QDRANT_COLLECTION', 'code_examples'),
      embeddingModel: this.config.get('EMBEDDING_LLM_MODEL'),
      embeddingType: this.config.get('EMBEDDING_TYPE'),
      vectorSize: this.getVectorSizeForModel(this.config.get('EMBEDDING_LLM_MODEL'))
    });

    // Initialize SQLite database
    // Use provided rootDir or static rootDir or fallback to process.cwd()
    // This prevents creating database inside .projects when working directory changes
    const projectRoot = rootDir || CodeRetrievalService.rootDir || process.cwd();
    const dbPath = join(projectRoot, '.build', 'data', 'code-examples.db');

    // Store rootDir for future instances
    if (rootDir) {
      CodeRetrievalService.rootDir = rootDir;
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();

    logger.info({ dbPath, projectRoot, runtime: 'bun' }, '📚 CodeRetrievalService initialized');
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
    return 1536;
  }

  /**
   * Initialize async components (Qdrant collection)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing Qdrant collection...');
      await this.qdrantService.ensureCollectionExists();
      logger.info('✅ Qdrant collection ready');
    } catch (error) {
      logger.error({ error }, '❌ Failed to initialize Qdrant collection');
      throw error;
    }
  }

  private initializeDatabase(): void {
    // Create code_examples table
    const schema = `
      CREATE TABLE IF NOT EXISTS code_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT NOT NULL,
        framework TEXT,
        tool TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        embedding TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        error_type TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tool ON code_examples(tool);
      CREATE INDEX IF NOT EXISTS idx_language ON code_examples(language);
      CREATE INDEX IF NOT EXISTS idx_success ON code_examples(success);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON code_examples(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_error_type ON code_examples(error_type);
    `;

    // Bun SQLite: exec can handle multiple statements
    this.db.exec(schema);
  }

  /**
   * Store a code example (success or failure)
   */
  async storeExample(example: Omit<CodeExample, 'id' | 'embedding' | 'timestamp'>): Promise<number> {
    try {
      // Generate embedding for the task
      const { embedding } = await this.embeddingService.generateEmbedding(example.task);

      const sql = `
        INSERT INTO code_examples (task, code, language, framework, tool, success, embedding, error_message, error_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        example.task,
        example.code,
        example.language,
        example.framework || null,
        example.tool,
        example.success ? 1 : 0,
        JSON.stringify(embedding),
        example.errorMessage || null,
        example.errorType || null
      ];

      // Bun SQLite
      const result = this.db.query(sql).run(...params);
      const insertId = result.lastInsertRowid as number;

      // Also store in Qdrant for vector search
      try {
        const codePoint: CodePoint = {
          id: insertId,
          vector: {
            dense: embedding
          },
          payload: {
            task: example.task,
            code: example.code,
            chunkType: 'full_file' as const,
            language: example.language,
            framework: example.framework,
            filePath: undefined,
            imports: [],
            exports: [],
            patterns: [],
            success: example.success,
            tool: example.tool,
            timestamp: Date.now(),
            codeHash: '' // TODO: generate hash
          }
        };

        await this.qdrantService.upsertPoint(codePoint);
        logger.debug({ id: insertId }, '✅ Example stored in Qdrant');
      } catch (qdrantError) {
        logger.warn({ error: qdrantError, id: insertId }, '⚠️ Failed to store in Qdrant, continuing with SQLite only');
      }

      const logLevel = example.success ? 'info' : 'warn';
      logger[logLevel]({
        id: insertId,
        task: example.task.substring(0, 50),
        language: example.language,
        tool: example.tool,
        success: example.success,
        errorType: example.errorType,
      }, example.success ? '✅ Code example stored' : '📝 Error example stored (for learning)');

      return insertId;
    } catch (error) {
      logger.error({ error, task: example.task }, '❌ Failed to store code example');
      throw error;
    }
  }

  /**
   * Retrieve similar code examples
   */
  async retrieveSimilarExamples(
    task: string,
    options: {
      tool?: string;
      language?: string;
      topK?: number;
      threshold?: number;
    } = {}
  ): Promise<RetrievalResult[]> {
    // Use configurable defaults from environment
    const defaultTopK = parseInt(this.config.getEnv('RAG_TOP_K') || '3');
    const defaultThreshold = parseFloat(this.config.getEnv('RAG_SIMILARITY_THRESHOLD') || '0.6');

    const { tool, language, topK = defaultTopK, threshold = defaultThreshold } = options;

    try {
      // Generate embedding for query task
      const { embedding: queryEmbedding } = await this.embeddingService.generateEmbedding(task);

      // Build filter for Qdrant search
      const filter: any = {
        must: [
          { key: 'success', match: { value: true } }
        ]
      };

      if (tool) {
        filter.must.push({ key: 'tool', match: { value: tool } });
      }

      if (language) {
        filter.must.push({ key: 'language', match: { value: language } });
      }

      // Search in Qdrant
      const searchResults = await this.qdrantService.searchDense(
        queryEmbedding,
        {
          topK: topK,
          filter
        }
      );

      // Convert Qdrant results to our format and apply threshold
      const results = searchResults
        .filter(result => result.score >= threshold)
        .map(result => ({
          similarity: result.score,
          example: {
            id: parseInt(result.id),
            task: result.payload.task,
            code: result.payload.code,
            language: result.payload.language,
            framework: result.payload.framework,
            tool: result.payload.tool,
            success: result.payload.success,
            timestamp: new Date(result.payload.timestamp)
          }
        }));

      logger.info({
        task: task.substring(0, 50),
        tool,
        language,
        foundCount: results.length,
        topSimilarity: results[0]?.similarity,
      }, '🔍 Retrieved similar examples from Qdrant');

      return results;
    } catch (error) {
      logger.error({ error, task }, '❌ Failed to retrieve examples');
      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  /**
   * Augment prompt with similar examples
   */
  augmentPromptWithExamples(
    originalPrompt: string,
    examples: RetrievalResult[]
  ): string {
    if (examples.length === 0) {
      return originalPrompt;
    }

    const examplesText = examples.map((result, i) => {
      const { example, similarity } = result;
      return `
Example ${i + 1} (similarity: ${(similarity * 100).toFixed(1)}%):
Task: ${example.task}
Language: ${example.language}${example.framework ? ` (${example.framework})` : ''}
Solution:
\`\`\`${example.language}
${example.code}
\`\`\`
`;
    }).join('\n');

    return `${originalPrompt}

<similar_examples>
Here are similar successful examples for reference. Use them as inspiration but adapt to the current task:

${examplesText}
</similar_examples>

Important: Adapt these examples to the current requirements. Don't copy verbatim.`;
  }

  /**
   * Get statistics about stored examples
   */
  getStats(): {
    total: number;
    byTool: Record<string, number>;
    byLanguage: Record<string, number>;
  } {
    // Bun SQLite
    const totalResult = this.db.query('SELECT COUNT(*) as count FROM code_examples WHERE success = 1').get();
    const total = (totalResult as any).count;

    const byToolRows = this.db.query('SELECT tool, COUNT(*) as count FROM code_examples WHERE success = 1 GROUP BY tool').all() as any[];
    const byLangRows = this.db.query('SELECT language, COUNT(*) as count FROM code_examples WHERE success = 1 GROUP BY language').all() as any[];

    const byTool = Object.fromEntries(byToolRows.map(r => [r.tool, r.count]));
    const byLanguage = Object.fromEntries(byLangRows.map(r => [r.language, r.count]));

    return { total, byTool, byLanguage };
  }

  /**
   * Clear old examples (keep last N days)
   */
  async clearOldExamples(daysToKeep: number = 30): Promise<number> {
    const sql = `
      DELETE FROM code_examples
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `;

    // Bun SQLite
    const result = this.db.query(sql).run(daysToKeep);
    const changes = result.changes || 0;

    logger.info({ daysToKeep, deleted: changes }, '🗑️ Cleared old examples');

    return changes;
  }

  /**
   * Retrieve similar error examples (for experiential co-learning)
   * Based on ChatDev paper: learn from past mistakes
   */
  async retrieveSimilarErrors(
    task: string,
    options: {
      tool?: string;
      language?: string;
      errorType?: string;
      topK?: number;
      threshold?: number;
    } = {}
  ): Promise<RetrievalResult[]> {
    const defaultTopK = parseInt(this.config.getEnv('RAG_TOP_K') || '3');
    const defaultThreshold = parseFloat(this.config.getEnv('RAG_SIMILARITY_THRESHOLD') || '0.6');

    const { tool, language, errorType, topK = defaultTopK, threshold = defaultThreshold } = options;

    try {
      // Generate embedding for query task
      const { embedding: queryEmbedding } = await this.embeddingService.generateEmbedding(task);

      // Build SQL query with filters - only get failures
      let sql = 'SELECT * FROM code_examples WHERE success = 0';
      const params: any[] = [];

      if (tool) {
        sql += ' AND tool = ?';
        params.push(tool);
      }

      if (language) {
        sql += ' AND language = ?';
        params.push(language);
      }

      if (errorType) {
        sql += ' AND error_type = ?';
        params.push(errorType);
      }

      sql += ' ORDER BY timestamp DESC LIMIT 100';

      // Bun SQLite
      const examples = this.db.query(sql).all(...params) as any[];

      // Calculate similarities
      const candidates = examples.map(ex => ({
        embedding: JSON.parse(ex.embedding),
        data: {
          id: ex.id,
          task: ex.task,
          code: ex.code,
          language: ex.language,
          framework: ex.framework,
          tool: ex.tool,
          success: false,
          timestamp: new Date(ex.timestamp),
          errorMessage: ex.error_message,
          errorType: ex.error_type,
        } as CodeExample,
      }));

      const results = this.embeddingService.findMostSimilar(
        queryEmbedding,
        candidates,
        topK,
        threshold
      );

      logger.info({
        task: task.substring(0, 50),
        tool,
        language,
        errorType,
        foundCount: results.length,
      }, '⚠️ Retrieved similar error examples');

      return results.map(r => ({
        example: r.data,
        similarity: r.similarity,
      }));
    } catch (error) {
      logger.error({ error, task }, '❌ Failed to retrieve error examples');
      return [];
    }
  }

  /**
   * Augment prompt with error warnings from similar past failures
   */
  augmentPromptWithErrorWarnings(
    originalPrompt: string,
    errorExamples: RetrievalResult[]
  ): string {
    if (errorExamples.length === 0) {
      return originalPrompt;
    }

    const warningsText = errorExamples.map((result, i) => {
      const { example, similarity } = result;
      return `
Warning ${i + 1} (similarity: ${(similarity * 100).toFixed(1)}%):
Task: ${example.task}
Error Type: ${example.errorType || 'unknown'}
Error Message: ${example.errorMessage || 'No message'}
Failed Attempt:
\`\`\`${example.language}
${example.code.substring(0, 200)}${example.code.length > 200 ? '...' : ''}
\`\`\`
`;
    }).join('\n');

    return `${originalPrompt}

<error_warnings>
⚠️ IMPORTANT: Similar tasks have failed in the past. Learn from these mistakes:

${warningsText}

Key lessons:
- Avoid the patterns shown in these failed attempts
- Pay attention to the error types and messages
- Use a different approach to solve this task
</error_warnings>`;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    byErrorType: Record<string, number>;
    byLanguage: Record<string, number>;
    recentErrors: Array<{ task: string; errorType: string; timestamp: Date }>;
  } {
    // Bun SQLite
    const totalResult = this.db.query('SELECT COUNT(*) as count FROM code_examples WHERE success = 0').get();
    const totalErrors = (totalResult as any).count;

    const byTypeRows = this.db.query(
      'SELECT error_type, COUNT(*) as count FROM code_examples WHERE success = 0 AND error_type IS NOT NULL GROUP BY error_type'
    ).all() as any[];

    const byLangRows = this.db.query(
      'SELECT language, COUNT(*) as count FROM code_examples WHERE success = 0 GROUP BY language'
    ).all() as any[];

    const recentRows = this.db.query(
      'SELECT task, error_type, timestamp FROM code_examples WHERE success = 0 ORDER BY timestamp DESC LIMIT 10'
    ).all() as any[];

    const byErrorType = Object.fromEntries(byTypeRows.map(r => [r.error_type, r.count]));
    const byLanguage = Object.fromEntries(byLangRows.map(r => [r.language, r.count]));
    const recentErrors = recentRows.map(r => ({
      task: r.task,
      errorType: r.error_type,
      timestamp: new Date(r.timestamp),
    }));

    return { totalErrors, byErrorType, byLanguage, recentErrors };
  }

  close(): void {
    this.db.close();
  }
}
