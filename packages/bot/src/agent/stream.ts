import {
  Query,
  SDKMessage,
  SDKPartialAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { SessionManager } from './manager.js';
import { BotConfig } from '../discord/sync.js';
// Memory capture happens in events.ts when Discord echoes messages back
import { memoryManager } from '../memory/manager.js';
import type { ILogger } from '../interfaces/logger.js';
import type { IMessage, ITextChannel, IThreadChannel, IAttachment } from '../interfaces/discord.js';

interface StreamState {
  currentToolUse: { name: string; input: string; id: string } | null;
  toolMessages: IMessage[];
  progressMessages: IMessage[];
  planContent: string | null;
  messagePrefix: string | null;
  messageSuffix: string | null;
  workingDir: string;
  channelId: string;
  channelName: string; // NEW: For server-wide memory
  sessionId: string;
  workspaceRoot: string;
  isCronJob: boolean;
  // Note: Thread creation now happens before streamToDiscord is called
  // For cron jobs: collect all messages and only send the last one
  collectedAssistantMessages: string[];
  // Usage information from query result
  usageInfo?: { total_cost: number; num_turns?: number };
  // Thinking message to delete before first real message
  thinkingMessageToDelete?: IMessage;
  thinkingMessageDeleted: boolean;
}

export interface StreamResult {
  usage?: {
    total_cost: number;
    num_turns?: number;
  };
}

export async function streamToDiscord(
  queryResult: Query,
  target: ITextChannel | IThreadChannel,
  sessionManager: SessionManager,
  sessionId: string,
  workingDir: string,
  logger: ILogger,
  botConfig?: BotConfig,
  messagePrefix?: string,
  parentChannelId?: string,
  isCronJob?: boolean,
  thinkingMessageToDelete?: IMessage,
  parentChannelName?: string // NEW: For server-wide memory
): Promise<StreamResult> {
  // Thread is already created before this function is called
  let channel: ITextChannel | IThreadChannel = target;

  // Extract workspace root from workingDir (workingDir is workspace/channel-name)
  const workspaceRoot = workingDir.split('/').slice(0, -1).join('/');

  // Use parentChannelId for memory operations (not thread ID)
  // If parentChannelId is provided (new message flow), use it
  // Otherwise use the current channel ID (for existing threads/channels)
  const memoryChannelId = parentChannelId || channel.id;
  const memoryChannelName = parentChannelName || 'unknown';

  const state: StreamState = {
    currentToolUse: null,
    toolMessages: [],
    progressMessages: [],
    planContent: null,
    messagePrefix: isCronJob ? null : (messagePrefix || null),
    messageSuffix: null,
    workingDir,
    channelId: memoryChannelId, // Use parent channel ID for memory
    channelName: memoryChannelName, // NEW: For server-wide memory
    sessionId,
    workspaceRoot,
    isCronJob: isCronJob || false,
    collectedAssistantMessages: [],
    thinkingMessageToDelete,
    thinkingMessageDeleted: false,
  };

  try {
    logger.info(`🚀 Starting SDK stream for session ${sessionId}`);
    logger.info(`📁 Working directory: ${workingDir}`);

    // Iterate through SDK messages
    for await (const message of queryResult) {
      channel = await handleSDKMessage(message, channel, state, sessionManager, sessionId, logger);
    }

    logger.info(`✅ SDK stream completed for session ${sessionId}`);

    // Save only the last assistant message to memory
    if (state.collectedAssistantMessages.length > 0) {
      const finalMessage = state.collectedAssistantMessages[state.collectedAssistantMessages.length - 1];

      // For cron jobs, send the final message with shared files attached (non-cron already sent during streaming)
      if (state.isCronJob) {
        // Get files to share before sending message
        const filesToShare = sessionManager.getFilesToShare(sessionId);
        channel = await sendCompleteMessage(channel, finalMessage, state.planContent, state.messagePrefix, state.messageSuffix, state, filesToShare, logger, sessionManager);
      }

      // Note: Memory capture happens automatically when Discord echoes this message back
      // See events.ts handleMessage() for centralized memory capture
    }

    // Save session ID for resumption
    await sessionManager.updateSession(sessionId, channel.id);

    // Note: Files are now attached inline to messages, not sent separately

    // Return usage information
    return { usage: state.usageInfo };
  } catch (error) {
    logger.error('❌ Stream error:', error);
    logger.error('❌ Stream error stack:', error instanceof Error ? error.stack : 'No stack trace');
    logger.error('❌ Stream error type:', error instanceof Error ? error.constructor.name : typeof error);

    try {
      await channel.send(
        `❌ Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } catch (sendError) {
      logger.error('Failed to send error message to Discord:', sendError);
    }

    // Re-throw to let outer handler deal with it
    throw error;
  }
}

async function handleSDKMessage(
  message: SDKMessage,
  channel: ITextChannel | IThreadChannel,
  state: StreamState,
  sessionManager: SessionManager,
  sessionId: string,
  logger: ILogger
): Promise<ITextChannel | IThreadChannel> {
  switch (message.type) {
    case 'assistant':
      // Final assistant message with complete response
      const content = extractTextFromMessage(message.message);
      if (content) {
        // Log assistant message (truncated)
        const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
        logger.info(`💬 Assistant: ${preview}`);

        // Collect all assistant messages
        state.collectedAssistantMessages.push(content);

        // For non-cron jobs, send each message immediately (streaming) with any queued files
        if (!state.isCronJob) {
          // Delete thinking message before sending first real response
          if (state.thinkingMessageToDelete && !state.thinkingMessageDeleted) {
            try {
              await state.thinkingMessageToDelete.delete();
              state.thinkingMessageDeleted = true;
              logger.info('🗑️  Deleted thinking message');
            } catch (error) {
              logger.error('Failed to delete thinking message:', error);
              // Continue anyway - not critical
              state.thinkingMessageDeleted = true; // Mark as deleted to not retry
            }
          }

          const filesToShare = sessionManager.getFilesToShare(sessionId);
          channel = await sendCompleteMessage(channel, content, state.planContent, state.messagePrefix, state.messageSuffix, state, filesToShare, logger, sessionManager);
          state.planContent = null; // Clear plan after sending
          state.messagePrefix = null; // Clear prefix after using
          state.messageSuffix = null; // Clear suffix after using
        }
      }
      break;

    case 'stream_event':
      // Partial message during streaming
      // Always process stream events for logging (including cron jobs)
      // Just don't send progress messages to Discord for cron jobs
      await handleStreamEvent(message, channel, state, logger);
      break;

    case 'user':
      // User message (echo or replay) - ignore for Discord
      break;

    case 'system':
      // System initialization message
      if (message.subtype === 'init') {
        logger.info(
          `Session ${message.session_id} initialized with model ${message.model}`
        );
        // Update database with real SDK session ID
        await sessionManager.updateSessionId(sessionId, message.session_id, channel.id);
      } else if (message.subtype === 'compact_boundary') {
        logger.info(`Conversation compacted: ${message.compact_metadata.trigger}`);
        await channel.send(
          `🗜️ Conversation history compacted (${message.compact_metadata.pre_tokens} tokens)`
        );
      }
      break;

    case 'result':
      // Final result message
      if (message.subtype === 'success') {
        // Capture usage information
        state.usageInfo = {
          total_cost: message.total_cost_usd,
          num_turns: message.num_turns,
        };

        logger.info(
          `✅ Session completed: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`
        );
      } else {
        // Error result
        const errors = 'errors' in message ? message.errors : [];
        await channel.send(`❌ **Error**: ${errors.join(', ')}`);
      }
      break;
  }

  // Return the potentially updated channel
  return channel;
}

const TRACKED_MUTATIONS = new Set([
  'Write', 'Edit',
  'schedule_one_time', 'schedule_recurring', 'schedule_remove',
  'discord_create_channel', 'discord_delete_channel',
  'discord_create_role', 'discord_assign_role', 'discord_remove_role',
  'discord_kick_member', 'discord_ban_member',
  'discord_create_event', 'discord_delete_event',
  'discord_create_poll',
  'discord_create_forum_post', 'discord_delete_forum_post',
]);

function buildActionDescription(toolName: string, input: string, workingDir: string): string | null {
  if (!TRACKED_MUTATIONS.has(toolName)) return null;

  try {
    const params = JSON.parse(input);

    switch (toolName) {
      case 'Write': {
        const filePath = params.file_path || '';
        if (filePath.includes('.claude/') || filePath.includes('.claude-cron') || filePath.includes('CLAUDE.md')) return null;
        return `file:write ${stripWorkingDirPrefix(filePath, workingDir)}`;
      }
      case 'Edit': {
        const filePath = params.file_path || '';
        if (filePath.includes('.claude/') || filePath.includes('.claude-cron') || filePath.includes('CLAUDE.md')) return null;
        return `file:edit ${stripWorkingDirPrefix(filePath, workingDir)}`;
      }
      case 'schedule_one_time':
        return `schedule: one-time task scheduled - "${params.task || ''}" at ${params.naturalTime || ''}`;
      case 'schedule_recurring':
        return `schedule: recurring task added - "${params.name || ''}" (${params.cronExpression || ''})`;
      case 'schedule_remove':
        return `schedule: task removed - "${params.identifier || ''}"`;
      case 'discord_create_channel':
        return `discord: created channel #${params.name || ''}`;
      case 'discord_delete_channel':
        return `discord: deleted channel ${params.channelId || ''}`;
      case 'discord_create_role':
        return `discord: created role @${params.name || ''}`;
      case 'discord_assign_role':
        return `discord: assigned role ${params.roleId || ''} to user ${params.userId || ''}`;
      case 'discord_remove_role':
        return `discord: removed role ${params.roleId || ''} from user ${params.userId || ''}`;
      case 'discord_kick_member':
        return `discord: kicked user ${params.userId || ''}${params.reason ? ` (${params.reason})` : ''}`;
      case 'discord_ban_member':
        return `discord: banned user ${params.userId || ''}${params.reason ? ` (${params.reason})` : ''}`;
      case 'discord_create_event':
        return `discord: created event "${params.name || ''}"`;
      case 'discord_delete_event':
        return `discord: deleted event ${params.eventId || ''}`;
      case 'discord_create_poll':
        return `discord: created poll "${params.question || ''}"`;
      case 'discord_create_forum_post':
        return `discord: created forum post "${params.title || ''}"`;
      case 'discord_delete_forum_post':
        return `discord: deleted forum post ${params.postId || ''}`;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function handleStreamEvent(
  message: SDKPartialAssistantMessage,
  channel: ITextChannel | IThreadChannel,
  state: StreamState,
  logger: ILogger
): Promise<void> {
  const event = message.event;

  switch (event.type) {
    case 'message_start':
      // New message starting
      break;

    case 'content_block_start':
      // New content block starting
      if (event.content_block.type === 'tool_use') {
        // Tool use starting
        state.currentToolUse = {
          name: event.content_block.name,
          input: '',
          id: event.content_block.id,
        };
      }
      break;

    case 'content_block_delta':
      // Content streaming - accumulate tool inputs for display
      if (event.delta.type === 'input_json_delta') {
        // Accumulate tool input JSON
        if (state.currentToolUse) {
          state.currentToolUse.input += event.delta.partial_json;
        }
      }
      // Text deltas are ignored - we'll get the complete text in the 'assistant' message
      break;

    case 'content_block_stop':
      // Content block finished - NOW send complete block to Discord
      if (state.currentToolUse) {
        // Special handling for ExitPlanMode - extract plan for attachment
        if (state.currentToolUse.name === 'ExitPlanMode') {
          try {
            const input = JSON.parse(state.currentToolUse.input);
            if (input.plan) {
              state.planContent = input.plan;
              // Send notification that plan is ready (but not for cron jobs)
              if (!state.isCronJob) {
                const msg = await channel.send(
                  '📋 **Plan Generated** - see attachment below'
                );
                state.progressMessages.push(msg);
              }
            }
          } catch (e) {
            logger.error('Failed to parse ExitPlanMode input:', e);
          }
        } else {
          // Log tool usage with input details
          const displayName = stripMcpPrefix(state.currentToolUse.name);
          const emoji = getToolEmoji(state.currentToolUse.name);

          // Parse and format input for logging
          let inputPreview = '';
          try {
            const input = JSON.parse(state.currentToolUse.input);
            const inputStr = JSON.stringify(input);
            inputPreview = inputStr.length > 200 ? inputStr.substring(0, 200) + '...' : inputStr;
          } catch (e) {
            inputPreview = state.currentToolUse.input.substring(0, 200);
          }

          logger.info(`🔧 Tool: ${emoji} ${displayName}`);
          logger.info(`   Input: ${inputPreview}`);

          // Track mutations in memory
          const actionDescription = buildActionDescription(displayName, state.currentToolUse.input, state.workingDir);
          if (actionDescription) {
            memoryManager.addAction(state.channelId, actionDescription);
          }
        }
        state.currentToolUse = null;
      }
      break;

    case 'message_delta':
      // Message metadata update (stop_reason, usage, etc.)
      if (event.delta.stop_reason === 'max_tokens') {
        await channel.send('⚠️ Response truncated due to token limit');
      }
      break;

    case 'message_stop':
      // Message complete - nothing to do, we'll get the complete text in 'assistant' message
      break;
  }
}

function extractTextFromMessage(message: any): string {
  let text = '';

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === 'text') {
        text += block.text;
      }
    }
  } else if (typeof message.content === 'string') {
    text = message.content;
  }

  return text.trim();
}

async function sendCompleteMessage(
  channel: ITextChannel | IThreadChannel,
  content: string,
  planContent: string | null,
  messagePrefix: string | null,
  messageSuffix: string | null,
  state: StreamState,
  filesToShare: string[] = [],
  logger: ILogger,
  sessionManager: SessionManager
): Promise<ITextChannel | IThreadChannel> {
  logger.info(`📤 Sending message to Discord (${content.length} chars)`);

  // Thread is already created before streamToDiscord is called
  const targetChannel = channel;

  // Prepend prefix if provided
  let fullContent = content;
  if (messagePrefix) {
    fullContent = `${messagePrefix}\n\n${content}`;
  }

  // Append suffix if provided
  if (messageSuffix) {
    fullContent = `${fullContent}${messageSuffix}`;
  }

  // Split message if it exceeds Discord's 2000 character limit
  const chunks = splitMessage(fullContent, 2000);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Attach files only on the last chunk
    if (i === chunks.length - 1 && (planContent || filesToShare.length > 0)) {
      const attachments: IAttachment[] = [];

      // Add plan file if exists
      if (planContent) {
        attachments.push({
          buffer: Buffer.from(planContent, 'utf-8'),
          name: `plan-${Date.now()}.md`,
          description: 'Claude Code Plan',
        });
      }

      // Add shared files if any
      for (const filePath of filesToShare) {
        attachments.push({ filePath });
      }

      await targetChannel.send({
        content: chunk,
        files: attachments,
      });

      if (filesToShare.length > 0) {
        logger.info(`📎 Attached ${filesToShare.length} shared file(s) to message`);
      }
    } else {
      await targetChannel.send(chunk);
    }
  }

  return targetChannel;
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  const lines = text.split('\n');

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      // Current line would exceed limit
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      // If single line is too long, split it by words
      if (line.length > maxLength) {
        const words = line.split(' ');
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function shouldShowToolMessage(toolName: string, input: string): boolean {
  try {
    const params = JSON.parse(input);

    // Filter out internal file operations
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      const filePath = params.file_path || '';

      // Hide operations on internal files
      if (filePath.includes('.claude-cron') ||
          filePath.includes('.claude/') ||
          filePath.includes('CLAUDE.md')) {
        return false;
      }
    }

    // Filter out schedule tool usage messages - keep them silent/internal
    if (toolName.startsWith('schedule_')) {
      return false;
    }

    return true;
  } catch (e) {
    // If we can't parse, show the message
    return true;
  }
}

function stripMcpPrefix(toolName: string): string {
  // Remove MCP server prefix like "mcp__cordbot-dynamic-tools__"
  const mcpPrefixRegex = /^mcp__[^_]+__/;
  return toolName.replace(mcpPrefixRegex, '');
}

function stripWorkingDirPrefix(filePath: string, workingDir: string): string {
  // If the file path starts with the working directory, strip it to show relative path
  if (filePath.startsWith(workingDir)) {
    const relative = filePath.slice(workingDir.length);
    // Remove leading slash if present
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }
  return filePath;
}

function getToolEmoji(toolName: string): string {
  // Strip MCP prefix for emoji lookup
  const cleanName = stripMcpPrefix(toolName);

  const emojiMap: Record<string, string> = {
    Bash: '⚙️',
    Read: '📄',
    Write: '✏️',
    Edit: '✏️',
    Glob: '🔍',
    Grep: '🔎',
    WebFetch: '🌐',
    WebSearch: '🔎',
    Task: '🤖',
    shareFile: '📎',
    schedule_list: '⏰',
    schedule_add: '➕',
    schedule_remove: '🗑️',
    schedule_update: '✏️',
    gmail_send_email: '📧',
    gmail_list_messages: '📬',
  };

  return emojiMap[cleanName] || '🔧';
}

function getToolDescription(toolName: string, input: string, workingDir: string): string {
  try {
    const params = JSON.parse(input);

    switch (toolName) {
      case 'Bash':
        return params.description || params.command || 'Running command';

      case 'Read':
        return stripWorkingDirPrefix(params.file_path || 'Reading file', workingDir);

      case 'Write':
        return stripWorkingDirPrefix(params.file_path || 'Writing file', workingDir);

      case 'Edit':
        return stripWorkingDirPrefix(params.file_path || 'Editing file', workingDir);

      case 'Glob':
        return params.pattern || 'Searching files';

      case 'Grep':
        return `Searching for "${params.pattern}"`;

      case 'WebFetch':
        return params.url || 'Fetching URL';

      case 'WebSearch':
        return `Searching: ${params.query}`;

      case 'Task':
        return params.description || params.prompt?.slice(0, 100) || 'Running task';

      case 'AskUserQuestion':
        return 'Asking question';

      case 'TaskCreate':
        return params.subject || 'Creating task';

      case 'TaskUpdate':
        return `Updating task ${params.taskId}`;

      case 'TaskList':
        return 'Listing tasks';

      case 'EnterPlanMode':
        return 'Entering plan mode';

      case 'shareFile':
        return `Sharing file: ${params.filePath}`;

      case 'schedule_list':
        return 'Listing scheduled tasks';

      case 'schedule_add':
        return `Adding task: ${params.name}`;

      case 'schedule_remove':
        return `Removing task: ${params.name}`;

      case 'schedule_update':
        return `Updating task: ${params.name}`;

      case 'gmail_send_email':
        return `Sending email to ${params.to}`;

      case 'gmail_list_messages':
        return params.query ? `Listing emails: ${params.query}` : 'Listing recent emails';

      default:
        // For unknown tools, try to extract first parameter value
        const firstValue = Object.values(params)[0];
        if (typeof firstValue === 'string') {
          return firstValue.slice(0, 100);
        }
        return 'Running tool';
    }
  } catch (e) {
    // If JSON parsing fails, return truncated raw input
    return input.slice(0, 100);
  }
}

