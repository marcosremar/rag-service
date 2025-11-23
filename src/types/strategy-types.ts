/**
 * Strategy Types
 *
 * Core type definitions for task execution and quality assessment
 * Note: Strategy execution, aggressiveness configurations, and scaffolding types have been removed
 * This file now contains only the essential type definitions for core functionality
 */

// Model tier types
export type ModelTier = 'primary' | 'secondary' | 'fast';

// Task analysis
export interface TaskAnalysis {
  complexity?: number;
  taskType?: string;
  requiresSecondaryModel?: boolean;
  timeEstimate?: number;
}

// Subtask and divide-conquer planning
export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  parentId?: string;
  dependencies: string[];
}

export interface DivideConquerPlan {
  mainTask: string;
  subtasks: Subtask[];
  strategy: string;
  estimatedDuration: number;
}

// Template types
export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  type: 'string' | 'number' | 'boolean' | 'array';
}

export interface TemplateMetadata {
  name: string;
  description: string;
  author?: string;
  version: string;
  tags: string[];
  variables: TemplateVariable[];
  language?: string;
  taskType?: string;
  complexityRange?: [number, number];
  keywords?: string[];
}

export interface Template {
  id: string;
  metadata: TemplateMetadata;
  structure: any; // Template structure (simplified - removed ScaffoldStructure dependency)
  content?: string; // Template code content
  createdAt: Date;
  updatedAt: Date;
}

// Quality assessment
export interface QualityIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface QualityScore {
  overall: number;
  correctness: number;
  completeness: number;
  style: number;
  issues: QualityIssue[];
}

// Refinement iteration
export interface RefinementIteration {
  iterationNumber: number;
  changes: string[];
  qualityBefore: QualityScore;
  qualityAfter: QualityScore;
  timestamp: Date;
}

export interface RefinementPlan {
  iterations: RefinementIteration[];
  targetQuality: number;
  currentQuality: number;
  completed: boolean;
}

// Execution context
export interface ExecutionContext {
  taskId: string;
  startTime: Date;
  estimatedDuration: number;
  currentModel: ModelTier;
  taskDescription: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  duration: number;
  modelsUsed: ModelTier[];
  qualityScore?: QualityScore;
  errors?: string[];
}

// Task type
export type TaskType =
  | 'code_generation'
  | 'code_refactoring'
  | 'debugging'
  | 'documentation'
  | 'testing'
  | 'optimization';
