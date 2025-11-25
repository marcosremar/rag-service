/**
 * Code Graph Service
 * 
 * Analyzes code dependencies using madge and TypeScript Compiler API
 * 
 * Features:
 * - Extracts imports from TypeScript/JavaScript files using madge
 * - Tracks dependencies between files
 * - Provides query methods to find affected files when a file changes
 * - Uses TypeScript Compiler API for deep analysis
 */

import { join, relative, resolve } from 'path';
import { logger } from '../utils/logger.js';
import madge from 'madge';
import * as ts from 'typescript';

export interface DependencyEdge {
  from: string;             // Source file path (relative)
  to: string;               // Target file path (relative)
  importType: 'relative' | 'absolute' | 'package';
  symbols: string[];        // Imported symbols (from TypeScript API)
}

export class CodeGraphService {
  private projectRoot: string;
  private madgeInstance: madge.MadgeInstance | null = null;
  private dependencies: Map<string, Set<string>> = new Map(); // file -> set of files it depends on
  private dependents: Map<string, Set<string>> = new Map();  // file -> set of files that depend on it
  private tsProgram: ts.Program | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Initialize madge instance and TypeScript program
   */
  async initialize(): Promise<void> {
    try {
      // Initialize madge - madge can be called with a directory or array of files
      // We'll build the graph on first use
      logger.info('Code Graph service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Code Graph');
      throw error;
    }
  }

  /**
   * Build dependency graph from codebase
   */
  async buildGraph(): Promise<void> {
    try {
      // Create madge instance
      this.madgeInstance = await madge(this.projectRoot, {
        fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
        excludeRegExp: [
          /node_modules/,
          /\.test\./,
          /\.spec\./,
          /dist/,
          /build/,
        ],
      });

      // Get dependency tree from madge
      const dependencyTree = this.madgeInstance.obj();
      
      // Clear existing maps
      this.dependencies.clear();
      this.dependents.clear();

      // Build bidirectional maps
      for (const [sourceFile, dependencies] of Object.entries(dependencyTree)) {
        const sourceRel = relative(this.projectRoot, sourceFile);
        
        if (!this.dependencies.has(sourceRel)) {
          this.dependencies.set(sourceRel, new Set());
        }

        // Dependencies is an array of file paths
        const depsArray = dependencies as string[];
        for (const dep of depsArray) {
          const depRel = relative(this.projectRoot, dep);
          
          // Add to dependencies map
          this.dependencies.get(sourceRel)!.add(depRel);

          // Add to dependents map (reverse)
          if (!this.dependents.has(depRel)) {
            this.dependents.set(depRel, new Set());
          }
          this.dependents.get(depRel)!.add(sourceRel);
        }
      }

      logger.info({ 
        files: this.dependencies.size,
        edges: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.size, 0)
      }, 'Code Graph built successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to build code graph');
      throw error;
    }
  }

  /**
   * Get all files that depend on a given file (reverse dependencies)
   */
  getDependents(filePath: string): string[] {
    const relPath = relative(this.projectRoot, filePath);
    return Array.from(this.dependents.get(relPath) || []);
  }

  /**
   * Get all files that a given file depends on
   */
  getDependencies(filePath: string): string[] {
    const relPath = relative(this.projectRoot, filePath);
    const deps = Array.from(this.dependencies.get(relPath) || []);
    return deps.map(dep => resolve(this.projectRoot, dep));
  }

  /**
   * Get all files affected when a file changes (transitive dependents)
   */
  getAffectedFiles(filePath: string, visited: Set<string> = new Set()): string[] {
    const relPath = relative(this.projectRoot, filePath);
    
    if (visited.has(relPath)) {
      return [];
    }
    visited.add(relPath);

    const affected: string[] = [];
    const directDependents = this.getDependents(relPath);

    for (const dependent of directDependents) {
      const fullPath = resolve(this.projectRoot, dependent);
      affected.push(fullPath);
      // Recursively get affected files
      affected.push(...this.getAffectedFiles(fullPath, visited));
    }

    return [...new Set(affected)]; // Remove duplicates
  }

  /**
   * Get circular dependencies
   */
  getCircularDependencies(): string[][] {
    if (!this.madgeInstance) {
      return [];
    }

    try {
      const circular = this.madgeInstance.circular();
      return circular.map(path => path.map(p => relative(this.projectRoot, p)));
    } catch (error) {
      logger.error({ error }, 'Failed to get circular dependencies');
      return [];
    }
  }

  /**
   * Get all dependencies as edges
   */
  getAllDependencies(): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    
    for (const [from, targets] of this.dependencies.entries()) {
      for (const to of targets) {
        // Determine import type
        const importType = this.getImportType(to);
        
        edges.push({
          from,
          to,
          importType,
          symbols: [], // Would need TypeScript API for this
        });
      }
    }
    
    return edges;
  }

  /**
   * Determine import type from path
   */
  private getImportType(importPath: string): 'relative' | 'absolute' | 'package' {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      return 'relative';
    }
    if (importPath.startsWith('/')) {
      return 'absolute';
    }
    // Package import (npm, pip, etc.)
    return 'package';
  }

  /**
   * Get dependency tree as object (for visualization)
   */
  getDependencyTree(): Record<string, string[]> {
    const tree: Record<string, string[]> = {};
    
    for (const [file, deps] of this.dependencies.entries()) {
      tree[file] = Array.from(deps);
    }
    
    return tree;
  }

  /**
   * Get statistics about the code graph
   */
  getStats(): {
    totalFiles: number;
    totalDependencies: number;
    circularDependencies: number;
    maxDepth: number;
  } {
    const totalFiles = this.dependencies.size;
    const totalDependencies = Array.from(this.dependencies.values())
      .reduce((sum, deps) => sum + deps.size, 0);
    const circularDeps = this.getCircularDependencies();
    
    // Calculate max depth (simplified)
    let maxDepth = 0;
    for (const file of this.dependencies.keys()) {
      const depth = this.calculateDepth(file, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      totalFiles,
      totalDependencies,
      circularDependencies: circularDeps.length,
      maxDepth,
    };
  }

  /**
   * Calculate dependency depth for a file
   */
  private calculateDepth(file: string, visited: Set<string>): number {
    if (visited.has(file)) {
      return 0; // Circular dependency
    }
    visited.add(file);

    const deps = this.dependencies.get(file) || [];
    if (deps.size === 0) {
      return 1;
    }

    const depths = Array.from(deps).map(dep => this.calculateDepth(dep, new Set(visited)));
    return 1 + Math.max(...depths, 0);
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.dependencies.clear();
    this.dependents.clear();
    this.madgeInstance = null;
    this.tsProgram = null;
  }

}
