/**
 * Error types for tool execution failures
 */
export type ToolErrorType =
  | 'validation'      // Invalid arguments/schema
  | 'execution'       // Runtime error during execution
  | 'permission'      // Permission denied
  | 'not_found'       // File/resource not found
  | 'network'         // Network/API error
  | 'timeout'         // Operation timeout
  | 'conflict'        // Resource conflict (file locked, etc)
  | 'internal';       // Internal/unknown error

/**
 * Structured error information for tool failures
 */
export interface ToolError {
  type: ToolErrorType;
  message: string;
  suggestedFix?: string;
  retryPossible: boolean;
  context?: {
    toolName?: string;
    attemptedArgs?: Record<string, unknown>;
    validationErrors?: string[];
    stackTrace?: string;
  };
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;  // Errors should be formatted as strings using formatToolError()
  data?: any;
  shouldStop?: boolean;  // Flag to stop tool execution loop (used by attempt_completion)
}

export interface ToolProgressStatus {
  icon?: string;
  text?: string;
  status?: 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
}

export interface CommandExecutionStatus {
  executionId: string;
  status: 'started' | 'output' | 'exited' | 'fallback' | 'timeout';
  pid?: number;
  command?: string;
  output?: string;
  exitCode?: number;
}

export interface FileOperationStatus {
  operationId: string;
  status: 'started' | 'progress' | 'completed' | 'failed' | 'announced' | 'verified' | 'summary';
  operation: 'create' | 'read' | 'write' | 'list' | 'edit' | 'search';
  path?: string;
  progress?: number; // 0-100 for progress indication
  details?: string; // additional info like "reading 50 lines" or "writing 200 bytes"
  toolName?: string; // Tool name (included in started/completed events to reduce event count)
  success?: boolean; // Tool execution success (included in completed event)
  result?: ToolResult; // Full tool result (included in completed event)
  announcement?: string; // Announcement text before creation
  verification?: {
    command?: string;
    output?: string;
    success?: boolean;
  };
  summary?: {
    title: string;
    description: string;
    features: string[];
    location: string;
    nextSteps?: string;
  };
}

export interface Tool {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<ToolResult>;
}

export interface EditorCommand {
  command: 'view' | 'str_replace' | 'create' | 'insert' | 'undo_edit';
  path?: string;
  old_str?: string;
  new_str?: string;
  content?: string;
  insert_line?: number;
  view_range?: [number, number];
  replace_all?: boolean;
}

export interface AgentState {
  currentDirectory: string;
  editHistory: EditorCommand[];
  tools: Tool[];
}

export interface ConfirmationState {
  skipThisSession: boolean;
  pendingOperation: boolean;
}