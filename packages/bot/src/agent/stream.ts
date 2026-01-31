import {
  Query,
  SDKMessage,
  SDKPartialAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { AttachmentBuilder, TextChannel, ThreadChannel, Message } from 'discord.js';
import { SessionManager } from './manager.js';
import { BotConfig } from '../discord/sync.js';
import { appendRawMemory } from '../memory/storage.js';
import { logRawMemoryCaptured } from '../memory/logger.js';

interface StreamState {
  currentToolUse: { name: string; input: string; id: string } | null;
  toolMessages: Message[];
  progressMessages: Message[];
  planContent: string | null;
  messagePrefix: string | null;
  workingDir: string;
  channelId: string;
  sessionId: string;
  workspaceRoot: string;
  // For lazy thread creation
  threadCreated: boolean;
  originalMessage: Message | null;
  threadName: string | null;
  parentChannel: TextChannel | null;
}

export async function streamToDiscord(
  queryResult: Query,
  target: TextChannel | ThreadChannel | Message,
  sessionManager: SessionManager,
  sessionId: string,
  workingDir: string,
  botConfig?: BotConfig,
  messagePrefix?: string,
  parentChannelId?: string
): Promise<void> {
  // Prepare for lazy thread creation (don't create yet)
  let channel: TextChannel | ThreadChannel;
  let threadCreated = false;
  let originalMessage: Message | null = null;
  let threadName: string | null = null;
  let parentChannel: TextChannel | null = null;

  if (target instanceof Message) {
    // Store info for lazy thread creation (create when first message is ready)
    originalMessage = target;
    parentChannel = target.channel as TextChannel;
    channel = parentChannel; // Temporarily use parent channel

    // Clean the message content by removing Discord mentions
    const cleanContent = target.content.replace(/<@!?\d+>/g, '').trim();

    threadName = botConfig?.mode === 'shared'
      ? `${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}`
      : `${target.author.username}: ${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}`;
  } else {
    // Already in a thread or channel
    channel = target;
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
    messagePrefix: messagePrefix || null,
    workingDir,
    channelId: memoryChannelId, // Use parent channel ID for memory
    sessionId,
    workspaceRoot,
    threadCreated,
    originalMessage,
    threadName,
    parentChannel,
  };

  try {
    console.log(`🚀 Starting SDK stream for session ${sessionId}`);
    console.log(`📁 Working directory: ${workingDir}`);

    // Iterate through SDK messages
    for await (const message of queryResult) {
      channel = await handleSDKMessage(message, channel, state, sessionManager, sessionId);
    }

    console.log(`✅ SDK stream completed for session ${sessionId}`);

    // Save session ID for resumption
    await sessionManager.updateSession(sessionId, channel.id);

    // Attach any files queued for sharing
    await attachSharedFiles(channel, sessionManager, sessionId);
  } catch (error) {
    console.error('❌ Stream error:', error);
    console.error('❌ Stream error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Stream error type:', error instanceof Error ? error.constructor.name : typeof error);

    try {
      await channel.send(
        `❌ Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } catch (sendError) {
      console.error('Failed to send error message to Discord:', sendError);
    }

    // Re-throw to let outer handler deal with it
    throw error;
  }
}

async function handleSDKMessage(
  message: SDKMessage,
  channel: TextChannel | ThreadChannel,
  state: StreamState,
  sessionManager: SessionManager,
  sessionId: string
): Promise<TextChannel | ThreadChannel> {
  switch (message.type) {
    case 'assistant':
      // Final assistant message with complete response
      const content = extractTextFromMessage(message.message);
      if (content) {
        // Send message (creates thread if needed) and get the actual channel
        channel = await sendCompleteMessage(channel, content, state.planContent, state.messagePrefix, state);
        state.planContent = null; // Clear plan after sending
        state.messagePrefix = null; // Clear prefix after using

        // Capture final message to memory
        try {
          await appendRawMemory(state.workspaceRoot, state.channelId, {
            timestamp: new Date().toISOString(),
            message: content,
            sessionId: state.sessionId,
            threadId: channel.id,
          });

          await logRawMemoryCaptured(
            state.workspaceRoot,
            state.channelId,
            content.length,
            state.sessionId
          );
        } catch (error) {
          console.error('Failed to capture memory:', error);
        }
      }
      break;

    case 'stream_event':
      // Partial message during streaming
      await handleStreamEvent(message, channel, state);
      break;

    case 'user':
      // User message (echo or replay) - ignore for Discord
      break;

    case 'system':
      // System initialization message
      if (message.subtype === 'init') {
        console.log(
          `Session ${message.session_id} initialized with model ${message.model}`
        );
        // Update database with real SDK session ID
        await sessionManager.updateSessionId(sessionId, message.session_id, channel.id);
      } else if (message.subtype === 'compact_boundary') {
        console.log(`Conversation compacted: ${message.compact_metadata.trigger}`);
        await channel.send(
          `🗜️ Conversation history compacted (${message.compact_metadata.pre_tokens} tokens)`
        );
      }
      break;

    case 'result':
      // Final result message
      if (message.subtype === 'success') {
        console.log(
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
  channel: TextChannel | ThreadChannel,
  state: StreamState
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
              // Send notification that plan is ready
              const msg = await channel.send(
                '📋 **Plan Generated** - see attachment below'
              );
              state.progressMessages.push(msg);
            }
          } catch (e) {
            console.error('Failed to parse ExitPlanMode input:', e);
          }
        } else {
          // Log tool use message (but don't send to Discord)
          const shouldShow = shouldShowToolMessage(state.currentToolUse.name, state.currentToolUse.input);
          if (shouldShow) {
            const emoji = getToolEmoji(state.currentToolUse.name);
            const description = getToolDescription(state.currentToolUse.name, state.currentToolUse.input, state.workingDir);
            // Strip MCP server prefix from tool name for cleaner display
            const displayName = stripMcpPrefix(state.currentToolUse.name);
            console.log(`🔧 Tool: ${emoji} ${displayName}: ${description}`);
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
  channel: TextChannel | ThreadChannel,
  content: string,
  planContent: string | null,
  messagePrefix: string | null,
  state: StreamState
): Promise<TextChannel | ThreadChannel> {
  console.log(`📤 Sending message to Discord (${content.length} chars)`);

  // Create thread now if needed (lazy thread creation)
  let targetChannel = channel;
  if (!state.threadCreated && state.originalMessage && state.parentChannel && state.threadName) {
    console.log(`✨ Creating thread: ${state.threadName}`);
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

  // Split message if it exceeds Discord's 2000 character limit
  const chunks = splitMessage(fullContent, 2000);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Attach plan file only on the last chunk
    if (i === chunks.length - 1 && planContent) {
      const attachment = new AttachmentBuilder(Buffer.from(planContent, 'utf-8'), {
        name: `plan-${Date.now()}.md`,
        description: 'Claude Code Plan',
      });

      await targetChannel.send({
        content: chunk,
        files: [attachment],
      });
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

async function attachSharedFiles(
  channel: TextChannel | ThreadChannel,
  sessionManager: SessionManager,
  sessionId: string
): Promise<void> {
  const filesToShare = sessionManager.getFilesToShare(sessionId);

  if (filesToShare.length === 0) {
    return;
  }

  try {
    const attachments = filesToShare.map(filePath => new AttachmentBuilder(filePath));

    await channel.send({
      content: '📎 Shared files:',
      files: attachments
    });

    console.log(`📎 Attached ${filesToShare.length} shared file(s)`);
  } catch (error) {
    console.error('Failed to attach shared files:', error);
    await channel.send(
      `❌ Failed to attach shared files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
