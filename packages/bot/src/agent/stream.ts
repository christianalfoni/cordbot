import {
  Query,
  SDKMessage,
  SDKPartialAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { SessionManager } from './manager.js';
import { BotConfig } from '../discord/sync.js';
import { appendRawMemory } from '../memory/storage.js';
import { logRawMemoryCaptured } from '../memory/logger.js';
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
  sessionId: string;
  workspaceRoot: string;
  isCronJob: boolean;
  // For lazy thread creation
  threadCreated: boolean;
  originalMessage: IMessage | null;
  threadName: string | null;
  parentChannel: ITextChannel | null;
  // For cron jobs: collect all messages and only send the last one
  collectedAssistantMessages: string[];
}

export async function streamToDiscord(
  queryResult: Query,
  target: ITextChannel | IThreadChannel | IMessage,
  sessionManager: SessionManager,
  sessionId: string,
  workingDir: string,
  logger: ILogger,
  botConfig?: BotConfig,
  messagePrefix?: string,
  parentChannelId?: string,
  isCronJob?: boolean
): Promise<void> {
  // Prepare for lazy thread creation (don't create yet)
  let channel: ITextChannel | IThreadChannel;
  let threadCreated = false;
  let originalMessage: IMessage | null = null;
  let threadName: string | null = null;
  let parentChannel: ITextChannel | null = null;

  // Check if target is a message by checking for message-specific properties
  const isMessage = 'author' in target && 'content' in target;

  if (isMessage) {
    // Target is IMessage - store info for lazy thread creation
    const message = target as IMessage;
    originalMessage = message;

    // Get channel from message
    const messageChannel = message.channel;
    parentChannel = messageChannel.isThreadChannel() ? null : (messageChannel as ITextChannel);
    channel = messageChannel;

    // Clean the message content by removing Discord mentions
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();

    threadName = botConfig?.mode === 'shared'
      ? `${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}`
      : `${message.author.username}: ${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}`;
  } else {
    // Already in a thread or channel
    channel = target as ITextChannel | IThreadChannel;
    threadCreated = true; // No need to create
  }

  // Extract workspace root from workingDir (workingDir is workspace/channel-name)
  const workspaceRoot = workingDir.split('/').slice(0, -1).join('/');

  // Use parentChannelId for memory operations (not thread ID)
  // If parentChannelId is provided (new message flow), use it
  // Otherwise use the current channel ID (for existing threads/channels)
  const memoryChannelId = parentChannelId || channel.id;

  const state: StreamState = {
    currentToolUse: null,
    toolMessages: [],
    progressMessages: [],
    planContent: null,
    messagePrefix: isCronJob ? null : (messagePrefix || null),
    messageSuffix: null,
    workingDir,
    channelId: memoryChannelId, // Use parent channel ID for memory
    sessionId,
    workspaceRoot,
    isCronJob: isCronJob || false,
    threadCreated,
    originalMessage,
    threadName,
    parentChannel,
    collectedAssistantMessages: [],
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
        channel = await sendCompleteMessage(channel, finalMessage, state.planContent, state.messagePrefix, state.messageSuffix, state, filesToShare, logger);
      }

      // Capture final message to memory (for both cron and non-cron)
      try {
        await appendRawMemory(state.channelId, {
          timestamp: new Date().toISOString(),
          message: finalMessage,
          sessionId: state.sessionId,
          threadId: channel.id,
        });

        await logRawMemoryCaptured(
          state.channelId,
          finalMessage.length,
          state.sessionId
        );
      } catch (error) {
        logger.error('Failed to capture memory:', error);
      }
    }

    // Save session ID for resumption
    await sessionManager.updateSession(sessionId, channel.id);

    // Note: Files are now attached inline to messages, not sent separately
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
          const filesToShare = sessionManager.getFilesToShare(sessionId);
          channel = await sendCompleteMessage(channel, content, state.planContent, state.messagePrefix, state.messageSuffix, state, filesToShare, logger);
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
  logger: ILogger
): Promise<ITextChannel | IThreadChannel> {
  logger.info(`📤 Sending message to Discord (${content.length} chars)`);

  // Create thread now if needed (lazy thread creation)
  let targetChannel = channel;
  if (!state.threadCreated && state.originalMessage && state.parentChannel && state.threadName) {
    logger.info(`✨ Creating thread: ${state.threadName}`);
    const thread = await state.parentChannel.threads.create({
      name: state.threadName,
      autoArchiveDuration: 1440,
      reason: 'Claude conversation',
      startMessage: state.originalMessage,
    });
    targetChannel = thread;
    state.threadCreated = true;

    // Note: Keep state.channelId as parent channel ID for memory operations
    // Don't update it to thread.id
  }

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

    // Filter out cron tool usage messages - keep them silent/internal
    if (toolName.startsWith('cron_')) {
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
    cron_list_jobs: '⏰',
    cron_add_job: '➕',
    cron_remove_job: '🗑️',
    cron_update_job: '✏️',
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

      case 'cron_list_jobs':
        return 'Listing scheduled jobs';

      case 'cron_add_job':
        return `Adding job: ${params.name}`;

      case 'cron_remove_job':
        return `Removing job: ${params.name}`;

      case 'cron_update_job':
        return `Updating job: ${params.name}`;

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

