/**
 * Language Server Protocol (LSP) Service
 * 
 * Provides basic LSP functionality for code analysis
 * 
 * Features:
 * - Syntax error detection
 * - Go to Definition
 * - Find References
 * - Symbol information
 * - Code diagnostics
 */

import { readFile } from 'fs/promises';
import { join, dirname, extname, relative } from 'path';
import { logger } from '../utils/logger.js';
import { CodeGraphService } from './code-graph.service.js';

export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  code?: string;
  source?: string;
}

export interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum' | 'module';
  location: Location;
  containerName?: string;
}

export class LSPService {
  private projectRoot: string;
  private codeGraph: CodeGraphService;
  private fileCache: Map<string, string> = new Map();

  constructor(projectRoot: string, codeGraph: CodeGraphService) {
    this.projectRoot = projectRoot;
    this.codeGraph = codeGraph;
  }

  /**
   * Get diagnostics (errors, warnings) for a file
   */
  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      const content = await this.getFileContent(filePath);
      const language = this.getLanguage(filePath);

      if (language === 'typescript' || language === 'javascript') {
        diagnostics.push(...this.analyzeTSJS(filePath, content));
      } else if (language === 'python') {
        diagnostics.push(...this.analyzePython(filePath, content));
      }
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to get diagnostics');
    }

    return diagnostics;
  }

  /**
   * Analyze TypeScript/JavaScript for basic errors
   */
  private analyzeTSJS(filePath: string, content: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = content.split('\n');

    // Basic syntax checks
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNum = index;

      // Check for unclosed brackets
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;

      // Simple check: if line has significantly more opens than closes, might be an issue
      // (This is a simplified check - real LSP would use proper parsing)
      if (openBraces > closeBraces + 2 || openParens > closeParens + 2 || openBrackets > closeBrackets + 2) {
        diagnostics.push({
          range: {
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: line.length },
          },
          severity: 'warning',
          message: 'Possible unclosed bracket',
          code: 'unclosed-bracket',
          source: 'lsp-service',
        });
      }

      // Check for common TypeScript errors
      if (trimmed.includes('any') && trimmed.includes(':')) {
        // Warn about 'any' type usage
        const anyIndex = trimmed.indexOf('any');
        diagnostics.push({
          range: {
            start: { line: lineNum, character: anyIndex },
            end: { line: lineNum, character: anyIndex + 3 },
          },
          severity: 'information',
          message: 'Consider using a more specific type instead of "any"',
          code: 'no-any',
          source: 'lsp-service',
        });
      }
    });

    // Check for undefined imports (basic check)
    const importLines = lines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.trim().startsWith('import'));

    for (const { line, idx } of importLines) {
      const importMatch = line.match(/from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const importPath = importMatch[1];
        // In a real implementation, we'd check if the file exists
        // For now, we'll just log it
      }
    }

    return diagnostics;
  }

  /**
   * Analyze Python for basic errors
   */
  private analyzePython(filePath: string, content: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNum = index;

      // Check indentation (Python-specific)
      if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('"""')) {
        const expectedIndent = this.getExpectedIndent(lines, index);
        const actualIndent = line.length - line.trimStart().length;
        
        // Basic indentation check (simplified)
        if (actualIndent % 4 !== 0 && actualIndent > 0) {
          diagnostics.push({
            range: {
              start: { line: lineNum, character: 0 },
              end: { line: lineNum, character: actualIndent },
            },
            severity: 'warning',
            message: 'Indentation should be a multiple of 4 spaces',
            code: 'indentation',
            source: 'lsp-service',
          });
        }
      }

      // Check for common Python issues
      if (trimmed.includes('print(') && !trimmed.includes('from __future__ import print_function')) {
        // Python 2 vs 3 check (simplified)
      }
    });

    return diagnostics;
  }

  /**
   * Get expected indentation for a Python line
   */
  private getExpectedIndent(lines: string[], index: number): number {
    if (index === 0) return 0;
    
    const prevLine = lines[index - 1].trimEnd();
    if (prevLine.endsWith(':')) {
      // Previous line ends with colon, expect indentation
      const prevIndent = lines[index - 1].length - lines[index - 1].trimStart().length;
      return prevIndent + 4;
    }
    
    // Same indentation as previous line
    return lines[index - 1].length - lines[index - 1].trimStart().length;
  }

  /**
   * Find definition of a symbol
   */
  async goToDefinition(filePath: string, line: number, character: number): Promise<Location[]> {
    const locations: Location[] = [];
    
    try {
      const content = await this.getFileContent(filePath);
      const lines = content.split('\n');
      const currentLine = lines[line] || '';
      
      // Extract symbol at cursor position
      const symbol = this.extractSymbolAtPosition(currentLine, character);
      if (!symbol) {
        return locations;
      }

      // Try to find definition in current file
      const localDef = this.findDefinitionInFile(filePath, content, symbol);
      if (localDef) {
        locations.push(localDef);
        return locations;
      }

      // Try to find in imported files
      const imports = await this.codeGraph.analyzeImports(filePath, content);
      for (const imp of imports) {
        if (imp.importedSymbols.includes(symbol)) {
          // Try to resolve the import and find the symbol
          const targetPath = join(this.projectRoot, imp.target);
          try {
            const targetContent = await this.getFileContent(targetPath);
            const def = this.findDefinitionInFile(targetPath, targetContent, symbol);
            if (def) {
              locations.push(def);
              break;
            }
          } catch {
            // File not found or error reading
          }
        }
      }
    } catch (error) {
      logger.error({ error, filePath, line, character }, 'Failed to go to definition');
    }

    return locations;
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    const locations: Location[] = [];
    
    try {
      const content = await this.getFileContent(filePath);
      const lines = content.split('\n');
      const currentLine = lines[line] || '';
      
      const symbol = this.extractSymbolAtPosition(currentLine, character);
      if (!symbol) {
        return locations;
      }

      // Find in current file
      const refs = this.findReferencesInFile(filePath, content, symbol);
      locations.push(...refs);

      // Find in dependent files (files that import this one)
      const dependents = this.codeGraph.getDependents(filePath);
      for (const dependent of dependents) {
        const dependentPath = join(this.projectRoot, dependent);
        try {
          const dependentContent = await this.getFileContent(dependentPath);
          const refs = this.findReferencesInFile(dependentPath, dependentContent, symbol);
          locations.push(...refs);
        } catch {
          // Skip if file can't be read
        }
      }
    } catch (error) {
      logger.error({ error, filePath, line, character }, 'Failed to find references');
    }

    return locations;
  }

  /**
   * Extract symbol at cursor position
   */
  private extractSymbolAtPosition(line: string, character: number): string | null {
    // Simple extraction: find word boundaries around cursor
    let start = character;
    let end = character;

    // Find start of symbol
    while (start > 0 && /[\w$]/.test(line[start - 1])) {
      start--;
    }

    // Find end of symbol
    while (end < line.length && /[\w$]/.test(line[end])) {
      end++;
    }

    const symbol = line.substring(start, end).trim();
    return symbol.length > 0 ? symbol : null;
  }

  /**
   * Find definition of symbol in file
   */
  private findDefinitionInFile(filePath: string, content: string, symbol: string): Location | null {
    const lines = content.split('\n');
    
    // Patterns for definitions
    const definitionPatterns = [
      new RegExp(`(?:function|const|let|var|class|interface|type|enum)\\s+${symbol}\\b`),
      new RegExp(`export\\s+(?:function|const|let|var|class|interface|type|enum)?\\s*${symbol}\\b`),
      new RegExp(`def\\s+${symbol}\\s*\\(`), // Python
      new RegExp(`class\\s+${symbol}\\s*[:\(]`), // Python
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of definitionPatterns) {
        const match = lines[i].match(pattern);
        if (match && match.index !== undefined) {
          return {
            uri: filePath,
            range: {
              start: { line: i, character: match.index },
              end: { line: i, character: match.index + symbol.length },
            },
          };
        }
      }
    }

    return null;
  }

  /**
   * Find all references to symbol in file
   */
  private findReferencesInFile(filePath: string, content: string, symbol: string): Location[] {
    const locations: Location[] = [];
    const lines = content.split('\n');
    const symbolRegex = new RegExp(`\\b${symbol}\\b`, 'g');

    lines.forEach((line, index) => {
      let match;
      while ((match = symbolRegex.exec(line)) !== null) {
        // Skip if it's a definition (basic check)
        if (line.match(new RegExp(`(?:function|const|let|var|class|interface|type|enum|def)\\s+${symbol}\\b`))) {
          continue;
        }

        locations.push({
          uri: filePath,
          range: {
            start: { line: index, character: match.index },
            end: { line: index, character: match.index + symbol.length },
          },
        });
      }
    });

    return locations;
  }

  /**
   * Get symbol information (hover)
   */
  async getSymbolInfo(filePath: string, line: number, character: number): Promise<SymbolInfo | null> {
    try {
      const content = await this.getFileContent(filePath);
      const lines = content.split('\n');
      const currentLine = lines[line] || '';
      
      const symbol = this.extractSymbolAtPosition(currentLine, character);
      if (!symbol) {
        return null;
      }

      // Try to find definition
      const definition = this.findDefinitionInFile(filePath, content, symbol);
      if (!definition) {
        return null;
      }

      // Determine symbol kind
      const defLine = lines[definition.range.start.line];
      let kind: SymbolInfo['kind'] = 'variable';
      
      if (defLine.includes('function') || defLine.includes('def ')) {
        kind = 'function';
      } else if (defLine.includes('class')) {
        kind = 'class';
      } else if (defLine.includes('interface')) {
        kind = 'interface';
      } else if (defLine.includes('type ')) {
        kind = 'type';
      } else if (defLine.includes('enum')) {
        kind = 'enum';
      }

      return {
        name: symbol,
        kind,
        location: definition,
      };
    } catch (error) {
      logger.error({ error, filePath, line, character }, 'Failed to get symbol info');
      return null;
    }
  }

  /**
   * Get file content (with caching)
   */
  private async getFileContent(filePath: string): Promise<string> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    const content = await readFile(filePath, 'utf-8');
    this.fileCache.set(filePath, content);
    return content;
  }

  /**
   * Invalidate file cache
   */
  invalidateCache(filePath: string): void {
    this.fileCache.delete(filePath);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * Get language from file extension
   */
  private getLanguage(filePath: string): 'typescript' | 'javascript' | 'python' | 'unknown' {
    const ext = extname(filePath);
    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx') return 'javascript';
    if (ext === '.py') return 'python';
    return 'unknown';
  }
}


