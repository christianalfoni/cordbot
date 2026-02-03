import type { Query, SDKMessage, SDKPartialAssistantMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Query options for creating a new query
 */
export interface QueryOptions {
  prompt: string;
  workingDirectory: string;
  sessionId?: string;
  resume?: string;
  systemPromptAppend?: string;
  tools?: any[];
  mcpServers?: any[];
  permissionMode?: 'bypassPermissions' | 'requestPermissions';
  allowDangerouslySkipPermissions?: boolean;
  includePartialMessages?: boolean;
}

/**
 * Query event types
 */
export type QueryEvent =
  | { type: 'message'; message: SDKMessage }
  | { type: 'partial'; message: SDKPartialAssistantMessage }
  | { type: 'error'; error: Error }
  | { type: 'done'; sessionId: string };

/**
 * Query executor interface - abstracts Claude Agent SDK operations
 */
export interface IQueryExecutor {
  /**
   * Create and execute a query
   */
  createQuery(options: QueryOptions): Query;

  /**
   * Execute a query and return an async iterator of events
   */
  executeQuery(query: Query): AsyncIterableIterator<QueryEvent>;

  /**
   * Resume an existing session
   */
  resumeSession(sessionId: string, options: Omit<QueryOptions, 'sessionId'>): Query;

  /**
   * Get the session ID from a query
   */
  getSessionId(query: Query): string | undefined;
}
