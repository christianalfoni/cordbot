import { query, Query, SDKMessage, SDKPartialAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { IQueryExecutor, QueryOptions, QueryEvent } from '../../interfaces/query.js';

/**
 * Claude Agent SDK query executor implementation
 */
export class ClaudeSDKQueryExecutor implements IQueryExecutor {
  createQuery(options: QueryOptions): Query {
    const sdkOptions: any = {
      cwd: options.workingDirectory,
      resume: options.resume || options.sessionId,
      includePartialMessages: options.includePartialMessages ?? true,
      permissionMode: options.permissionMode || 'bypassPermissions',
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions ?? true,
    };

    if (options.systemPromptAppend) {
      sdkOptions.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: options.systemPromptAppend,
      };
    }

    if (options.tools) {
      sdkOptions.tools = options.tools;
    }

    if (options.mcpServers) {
      sdkOptions.mcpServers = options.mcpServers;
    }

    return query({
      prompt: options.prompt,
      options: sdkOptions,
    });
  }

  async *executeQuery(query: Query): AsyncIterableIterator<QueryEvent> {
    try {
      for await (const event of query) {
        if ('role' in event && event.role === 'assistant') {
          // Full message
          yield { type: 'message', message: event as SDKMessage };
        } else if ('partial' in event) {
          // Partial message
          yield { type: 'partial', message: event as unknown as SDKPartialAssistantMessage };
        }
      }

      // Query completed successfully
      const sessionId = this.getSessionId(query);
      if (sessionId) {
        yield { type: 'done', sessionId };
      }
    } catch (error) {
      yield { type: 'error', error: error as Error };
    }
  }

  resumeSession(sessionId: string, options: Omit<QueryOptions, 'sessionId'>): Query {
    return this.createQuery({
      ...options,
      resume: sessionId,
    });
  }

  getSessionId(query: Query): string | undefined {
    // The SDK query object doesn't expose sessionId directly
    // We'll need to track it externally or extract it from the query results
    // For now, return undefined as a placeholder
    return undefined;
  }
}
