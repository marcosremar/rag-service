/**
 * Codebase Indexer Service
 *
 * Automatically indexes project files with embeddings (similar to Cursor AI)
 *
 * Features:
 * - Automatic indexing on startup
 * - Incremental updates via file watching
 * - Tree-sitter based chunking (syntax-aware)
 * - Local embeddings (BGE-small, fast & free)
 * - SQLite storage with metadata
 */

import { watch, type FSWatcher } from 'fs';
import { readFile, stat, mkdir } from 'fs/promises';
import { join, relative, extname, dirname } from 'path';
import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger.js';
import { EmbeddingService } from './embedding.service.js';
import { ASTCodeChunker} from './chunking/ast-chunker.service.js';
import type { Language } from './chunking/types.js';
import { glob } from 'glob';
import ignore from 'ignore';

interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  lastIndexed: number;
  indexDuration: number;
}

export class CodebaseIndexerService {
  private db: Database;
  private embeddingService: EmbeddingService;
  private chunker: ASTCodeChunker;
  private projectRoot: string;
  private watcher: FSWatcher | null = null;
  private ignoreFilter: ReturnType<typeof ignore> | null = null;
  private isIndexing: boolean = false;
  private indexQueue: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private enableAutoIndex: boolean;

  // Supported file extensions
  private readonly SUPPORTED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py'
  ]);

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
    this.enableAutoIndex = process.env.ENABLE_CODEBASE_INDEX !== 'false';

    // Initialize services
    this.embeddingService = new EmbeddingService();
    this.chunker = new ASTCodeChunker();

    // Initialize database
    const dbPath = join(this.projectRoot, 'data', 'codebase-index.db');

    // Ensure data directory exists (sync to avoid async in constructor)
    const dataDir = dirname(dbPath);
    try {
      const fs = require('fs');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to create data directory');
      throw error;
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();

    // Load ignore patterns
    this.loadIgnorePatterns();

    if (this.enableAutoIndex) {
      logger.info('📚 CodebaseIndexer initialized (automatic indexing enabled)');
    } else {
      logger.info('📚 CodebaseIndexer initialized (automatic indexing disabled)');
    }
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        chunk_type TEXT NOT NULL,
        chunk_name TEXT,
        language TEXT NOT NULL,
        embedding BLOB NOT NULL,
        last_modified INTEGER NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_file_path ON code_chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_relative_path ON code_chunks(relative_path);
      CREATE INDEX IF NOT EXISTS idx_language ON code_chunks(language);
      CREATE INDEX IF NOT EXISTS idx_chunk_type ON code_chunks(chunk_type);
      CREATE INDEX IF NOT EXISTS idx_last_modified ON code_chunks(last_modified);

      CREATE TABLE IF NOT EXISTS index_stats (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_files INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        last_indexed INTEGER DEFAULT 0,
        index_duration INTEGER DEFAULT 0,
        CHECK (id = 1)
      );

      INSERT OR IGNORE INTO index_stats (id) VALUES (1);
    `);
  }

  /**
   * Load .gitignore and .agentignore patterns
   */
  private async loadIgnorePatterns(): Promise<void> {
    try {
      this.ignoreFilter = ignore();

      // Default ignores
      this.ignoreFilter.add([
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '.build/**',
        'tmp/**',
        '.tmp/**',
        'coverage/**',
        '.next/**',
        '.cache/**',
        '*.log',
        '.env',
        '.env.*',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'data/**/*.db',
        'data/**/*.db-*',
      ]);

      // Load .gitignore
      try {
        const gitignore = await readFile(join(this.projectRoot, '.gitignore'), 'utf-8');
        this.ignoreFilter.add(gitignore.split('\n').filter(line => line.trim() && !line.startsWith('#')));
      } catch (e) {
        // No .gitignore, skip
      }

      // Load .agentignore
      try {
        const agentignore = await readFile(join(this.projectRoot, '.agentignore'), 'utf-8');
        this.ignoreFilter.add(agentignore.split('\n').filter(line => line.trim() && !line.startsWith('#')));
      } catch (e) {
        // No .agentignore, skip
      }

      logger.debug('Loaded ignore patterns for codebase indexing');
    } catch (error) {
      logger.error({ error }, 'Failed to load ignore patterns');
    }
  }

  /**
   * Check if file should be indexed
   */
  private shouldIndexFile(filePath: string): boolean {
    const ext = extname(filePath);

    // Check extension
    if (!this.SUPPORTED_EXTENSIONS.has(ext)) {
      return false;
    }

    // Check ignore patterns
    if (this.ignoreFilter) {
      const relativePath = relative(this.projectRoot, filePath);
      if (this.ignoreFilter.ignores(relativePath)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get language from file extension
   */
  private getLanguage(filePath: string): Language {
    const ext = extname(filePath);

    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx') return 'javascript';
    if (ext === '.py') return 'python';

    return 'unknown';
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      if (!this.shouldIndexFile(filePath)) {
        return;
      }

      const fileStats = await stat(filePath);
      const lastModified = fileStats.mtimeMs;
      const relativePath = relative(this.projectRoot, filePath);

      // Check if file already indexed and not modified
      const existing = this.db.query(`
        SELECT last_modified FROM code_chunks
        WHERE file_path = ?
        LIMIT 1
      `).get(filePath) as { last_modified: number } | null;

      if (existing && existing.last_modified >= lastModified) {
        logger.debug({ file: relativePath }, 'File already indexed (not modified)');
        return;
      }

      // Read file content
      const content = await readFile(filePath, 'utf-8');
      const language = this.getLanguage(filePath);

      if (language === 'unknown') {
        logger.debug({ file: relativePath }, 'Unsupported language, skipping');
        return;
      }

      // Remove old chunks for this file
      this.db.query('DELETE FROM code_chunks WHERE file_path = ?').run(filePath);

      // Chunk the file using AST-based chunker
      const chunks = this.chunker.chunkCode(content, language);

      // Generate embeddings and store
      const insertStmt = this.db.prepare(`
        INSERT INTO code_chunks (
          id, file_path, relative_path, content, start_line, end_line,
          chunk_type, chunk_name, language, embedding, last_modified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let chunkCount = 0;

      for (const chunk of chunks) {
        try {
          // Generate embedding (with small delay to avoid rate limiting)
          const embeddingResult = await this.embeddingService.generateEmbedding(chunk.code);

          // Store chunk
          const id = `${relativePath}:${chunk.startLine}-${chunk.endLine}:${chunk.type}`;
          const embeddingBuffer = Buffer.from(new Float32Array(embeddingResult.embedding).buffer);

          insertStmt.run(
            id,
            filePath,
            relativePath,
            chunk.code,
            chunk.startLine,
            chunk.endLine,
            chunk.type,
            chunk.name || null,
            chunk.language,
            embeddingBuffer,
            lastModified
          );

          chunkCount++;

          // Small delay between API calls (only if using API backend)
          if (process.env.EMBEDDING_BACKEND === 'api') {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          logger.error({ error, file: relativePath, chunk: chunk.type }, 'Failed to embed chunk');
          // Continue with next chunk even if one fails
        }
      }

      logger.debug({ file: relativePath, chunks: chunkCount }, 'File indexed');

    } catch (error) {
      logger.error({ error, file: filePath }, 'Failed to index file');
    }
  }

  /**
   * Index entire codebase
   */
  async indexCodebase(): Promise<IndexStats> {
    if (this.isIndexing) {
      logger.warn('Indexing already in progress');
      return this.getStats();
    }

    this.isIndexing = true;
    const startTime = Date.now();

    try {
      logger.info('🔍 Starting codebase indexing...');

      // Find all source files
      const patterns = Array.from(this.SUPPORTED_EXTENSIONS).map(ext => `**/*${ext}`);
      const files = await glob(patterns, {
        cwd: this.projectRoot,
        ignore: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '.build/**',
          'tmp/**',
          'coverage/**',
          '.test-*/**',
          'test-*/**',
        ],
        absolute: true,
      });

      logger.info({ totalFiles: files.length }, 'Found files to index');

      // Index files in batches
      const batchSize = 10;
      let indexed = 0;

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map(file => this.indexFile(file)));
        indexed += batch.length;

        if (indexed % 50 === 0) {
          logger.info({ indexed, total: files.length }, 'Indexing progress');
        }
      }

      // Update stats
      const duration = Date.now() - startTime;
      const stats = this.getStats();

      this.db.query(`
        UPDATE index_stats SET
          total_files = ?,
          total_chunks = ?,
          last_indexed = ?,
          index_duration = ?
        WHERE id = 1
      `).run(files.length, stats.totalChunks, Date.now(), duration);

      logger.info(
        {
          files: files.length,
          chunks: stats.totalChunks,
          duration: `${(duration / 1000).toFixed(2)}s`
        },
        '✅ Codebase indexed successfully'
      );

      return { ...stats, totalFiles: files.length, indexDuration: duration };

    } catch (error) {
      logger.error({ error }, 'Failed to index codebase');
      throw error;
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    const result = this.db.query(`
      SELECT total_files, total_chunks, last_indexed, index_duration
      FROM index_stats
      WHERE id = 1
    `).get() as IndexStats | null;

    const chunkCount = this.db.query('SELECT COUNT(*) as count FROM code_chunks').get() as { count: number };

    return {
      totalFiles: result?.totalFiles || 0,
      totalChunks: chunkCount.count,
      lastIndexed: result?.lastIndexed || 0,
      indexDuration: result?.indexDuration || 0,
    };
  }

  /**
   * Search for similar code chunks
   */
  async searchSimilar(query: string, options?: {
    topK?: number;
    threshold?: number;
    language?: string;
  }): Promise<Array<{
    filePath: string;
    relativePath: string;
    content: string;
    startLine: number;
    endLine: number;
    similarity: number;
    language: string;
    chunkType: string;
    chunkName?: string;
  }>> {
    const topK = options?.topK || 5;
    const threshold = options?.threshold || 0.7;

    try {
      // Generate query embedding
      const queryEmbeddingResult = await this.embeddingService.generateEmbedding(query);
      const queryEmbedding = new Float32Array(queryEmbeddingResult.embedding);

      // Get all chunks (with optional language filter)
      let chunks: Array<{
        file_path: string;
        relative_path: string;
        content: string;
        start_line: number;
        end_line: number;
        language: string;
        chunk_type: string;
        chunk_name: string | null;
        embedding: Buffer;
      }>;

      if (options?.language) {
        chunks = this.db.query(`
          SELECT file_path, relative_path, content, start_line, end_line,
                 language, chunk_type, chunk_name, embedding
          FROM code_chunks
          WHERE language = ?
        `).all(options.language) as any;
      } else {
        chunks = this.db.query(`
          SELECT file_path, relative_path, content, start_line, end_line,
                 language, chunk_type, chunk_name, embedding
          FROM code_chunks
        `).all() as any;
      }

      // Calculate similarities
      const results = chunks.map(chunk => {
        const embedding = new Float32Array(chunk.embedding.buffer);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);

        return {
          filePath: chunk.file_path,
          relativePath: chunk.relative_path,
          content: chunk.content,
          startLine: chunk.start_line,
          endLine: chunk.end_line,
          similarity,
          language: chunk.language,
          chunkType: chunk.chunk_type,
          chunkName: chunk.chunk_name || undefined,
        };
      });

      // Filter and sort
      return results
        .filter(r => r.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

    } catch (error) {
      logger.error({ error }, 'Failed to search similar code');
      return [];
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
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
   * Start file watching for automatic updates
   */
  startWatching(): void {
    if (this.watcher || !this.enableAutoIndex) {
      return;
    }

    logger.info('👀 Starting file watcher for automatic indexing');

    // Watch project root recursively
    this.watcher = watch(
      this.projectRoot,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        const fullPath = join(this.projectRoot, filename);

        if (this.shouldIndexFile(fullPath)) {
          // Add to queue (debounced)
          this.indexQueue.add(fullPath);

          // Clear existing timer
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }

          // Process queue after 2 seconds of no activity
          this.debounceTimer = setTimeout(() => this.processIndexQueue(), 2000);
        }
      }
    );
  }

  /**
   * Process queued files for indexing
   */
  private async processIndexQueue(): Promise<void> {
    if (this.indexQueue.size === 0 || this.isIndexing) {
      return;
    }

    const files = Array.from(this.indexQueue);
    this.indexQueue.clear();

    logger.debug({ count: files.length }, 'Processing file index queue');

    for (const file of files) {
      await this.indexFile(file);
    }
  }

  /**
   * Stop file watching
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('Stopped file watcher');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Remove file from index
   */
  removeFile(filePath: string): void {
    const relativePath = relative(this.projectRoot, filePath);
    this.db.query('DELETE FROM code_chunks WHERE file_path = ?').run(filePath);
    logger.debug({ file: relativePath }, 'File removed from index');
  }

  /**
   * Clear entire index
   */
  clearIndex(): void {
    this.db.query('DELETE FROM code_chunks').run();
    this.db.query('UPDATE index_stats SET total_files = 0, total_chunks = 0, last_indexed = 0').run();
    logger.info('Cleared codebase index');
  }

  /**
   * Cleanup
   */
  close(): void {
    this.stopWatching();
    this.db.close();
  }
}
