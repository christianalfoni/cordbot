import path from 'path';
import { SessionManager } from '../agent/manager.js';
import { streamToDiscord } from '../agent/stream.js';
import { ChannelMapping, getChannelMapping, syncNewChannel, updateChannelClaudeMdTopic, updateServerDescription, BotConfig } from './sync.js';
import { CronRunner } from '../scheduler/runner.js';
import { trackMessage } from '../message-tracking/tracker.js';
import { QueryLimitManager } from '../service/query-limit-manager.js';
import { processAttachments, formatAttachmentPrompt } from './attachment-handler.js';
import type { IBotContext } from '../interfaces/core.js';
import type { IMessage, ITextChannel, IThreadChannel, IChannel, IChatInputCommandInteraction } from '../interfaces/discord.js';
import type { ILogger } from '../interfaces/logger.js';

// Queue to prevent concurrent processing of messages in the same thread
const threadLocks = new Map<string, Promise<void>>();

// Buffer for messages that mentioned others (for context in shared mode)
interface BufferedMessage {
  author: string;
  content: string;
  timestamp: Date;
}
const messageBuffers = new Map<string, BufferedMessage[]>();

export function setupEventHandlers(
  context: IBotContext,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  workspaceRoot: string,
  workingDirectory: string,
  guildId: string,
  cronRunner: CronRunner,
  logger: ILogger,
  baseUrl: string,
  botConfig?: BotConfig,
  queryLimitManager?: QueryLimitManager
): void {
  // Handle new messages
  context.discord.on('messageCreate', async (message) => {
    // Filter to only our guild
    if (message.guildId !== guildId) {
      return;
    }

    try {
      // NEW: Track ALL public messages (not just bot interactions)
      if (!message.author.bot) {
        try {
          // Only track non-thread messages
          if (!message.channel.isThreadChannel()) {
            await trackMessage(message);
          }
        } catch (trackError) {
          logger.error('Error tracking message:', trackError);
          // Don't block message processing on tracking failure
        }
      }

      // Existing bot interaction logic
      await handleMessageWithLock(message, context, sessionManager, channelMappings, workspaceRoot, logger, botConfig, queryLimitManager);
    } catch (error) {
      logger.error('❌ Fatal error in messageCreate handler:', error);
      // Try to notify the user
      try {
        await message.reply(
          `❌ Sorry, I encountered a critical error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      } catch (replyError) {
        logger.error('Failed to send error notification:', replyError);
      }
    }
  });

  // Handle new channels being created
  context.discord.on('channelCreate', async (channel) => {
    // Only handle text channels in the configured guild (type 0 is GuildText)
    if (channel.type !== 0) return;
    if (channel.guildId !== guildId) return;
    if (!channel.isTextChannel()) return;

    try {
      logger.info(`\n🆕 New channel detected: #${channel.name}`);

      // Sync the new channel
      const mapping = await syncNewChannel(channel, workspaceRoot, workingDirectory, botConfig);

      // Add to mappings array so it's immediately available
      channelMappings.push(mapping);

      // Start watching the cron file for this channel
      cronRunner.addChannel(mapping);

      logger.info(`✅ Channel #${channel.name} synced and ready\n`);
    } catch (error) {
      logger.error(`❌ Error syncing new channel #${channel.name}:`, error);
    }
  });

  // Handle channels being deleted
  context.discord.on('channelDelete', async (channel) => {
    // Only handle text channels in the configured guild (type 0 is GuildText)
    if (channel.type !== 0) return;
    if (channel.guildId !== guildId) return;

    try {
      logger.info(`\n🗑️  Channel deleted: #${channel.name}`);

      // Find the mapping for this channel
      const mappingIndex = channelMappings.findIndex(m => m.channelId === channel.id);

      if (mappingIndex === -1) {
        logger.info(`Channel #${channel.name} was not synced, skipping cleanup`);
        return;
      }

      const mapping = channelMappings[mappingIndex];

      // Stop watching the cron file
      cronRunner.removeChannel(channel.id);

      // Remove from mappings array
      channelMappings.splice(mappingIndex, 1);

      // Note: We don't delete channel folders - they remain as leftovers

      logger.info(`✅ Channel #${channel.name} cleanup complete\n`);
    } catch (error) {
      logger.error(`❌ Error cleaning up channel #${channel.name}:`, error);
    }
  });

  // Handle channel updates (e.g., topic changes)
  context.discord.on('channelUpdate', async (oldChannel, newChannel) => {
    // Only handle text channels in the configured guild (type 0 is GuildText)
    if (newChannel.type !== 0) return;
    if (newChannel.guildId !== guildId) return;
    if (!newChannel.isTextChannel() || !oldChannel.isTextChannel()) return;

    // Check if topic changed
    const oldTopic = oldChannel.topic || '';
    const newTopic = newChannel.topic || '';

    if (oldTopic !== newTopic) {
      const mapping = getChannelMapping(newChannel.id, channelMappings);

      if (mapping) {
        try {
          logger.info(`\n📝 Topic updated for #${newChannel.name}`);
          await updateChannelClaudeMdTopic(mapping.claudeMdPath, newTopic);
          logger.info(`✅ Synced topic to CLAUDE.md\n`);
        } catch (error) {
          logger.error(`❌ Error syncing topic for #${newChannel.name}:`, error);
        }
      }
    }
  });

  // Handle guild updates (e.g., server description changes)
  context.discord.on('guildUpdate', async (oldGuild, newGuild) => {
    // Only handle our configured guild
    if (newGuild.id !== guildId) return;

    // Check if description changed
    const oldDesc = oldGuild.description || '';
    const newDesc = newGuild.description || '';

    if (oldDesc !== newDesc) {
      try {
        logger.info(`\n📝 Server description updated`);
        const serverDescPath = path.join(workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
        await updateServerDescription(serverDescPath, newDesc);
        logger.info(`✅ Synced server description\n`);
      } catch (error) {
        logger.error(`❌ Error syncing server description:`, error);
      }
    }
  });

  // Handle slash command interactions
  context.discord.on('interactionCreate', async (interaction) => {
    // Only handle chat input commands (slash commands)
    if (!('commandName' in interaction)) {
      return;
    }

    // Filter to only our guild (same as messageCreate)
    if (interaction.guildId !== guildId) {
      return;
    }

    if (interaction.commandName === 'workspace') {
      await handleWorkspaceCommand(interaction, context, workspaceRoot, logger, baseUrl);
    }
  });

  // Handle errors
  context.discord.on('error', (error) => {
    logger.error('Discord client error:', error);
  });

  // Handle warnings
  context.discord.on('warn', (warning) => {
    logger.warn('Discord client warning:', warning);
  });
}

async function handleMessageWithLock(
  message: IMessage,
  context: IBotContext,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  workspaceRoot: string,
  logger: ILogger,
  botConfig?: BotConfig,
  queryLimitManager?: QueryLimitManager
): Promise<void> {
  // Determine thread ID for locking
  const threadId = message.channel.isThreadChannel()
    ? message.channel.id
    : message.id; // For new threads, use message ID temporarily

  try {
    // Wait for any existing processing on this thread to complete
    const existingLock = threadLocks.get(threadId);
    if (existingLock) {
      await existingLock.catch(() => {
        // Ignore errors from previous lock - we'll try again
        logger.info(`Previous lock for ${threadId} failed, continuing anyway`);
      });
    }

    // Create new lock for this message
    const newLock = handleMessage(message, context, sessionManager, channelMappings, workspaceRoot, logger, botConfig, queryLimitManager)
      .finally(() => {
        // Remove lock when done
        try {
          if (threadLocks.get(threadId) === newLock) {
            threadLocks.delete(threadId);
          }
        } catch (error) {
          logger.error('Error removing lock:', error);
        }
      });

    threadLocks.set(threadId, newLock);
    await newLock;
  } catch (error) {
    logger.error(`Error in handleMessageWithLock for ${threadId}:`, error);
    throw error; // Re-throw so outer handler can notify user
  }
}

async function handleMessage(
  message: IMessage,
  context: IBotContext,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  workspaceRoot: string,
  logger: ILogger,
  botConfig?: BotConfig,
  queryLimitManager?: QueryLimitManager
): Promise<void> {
  // Determine the parent channel ID
  let parentChannelId: string;
  if (message.channel.isThread()) {
    parentChannelId = message.channel.parentId || message.channel.id;
  } else {
    parentChannelId = message.channelId;
  }

  // Get channel mapping
  const mapping = getChannelMapping(parentChannelId, channelMappings);
  if (!mapping) {
    // Not a synced channel - ignore
    return;
  }

  // Helper to clean message content (replace mentions with names)
  const cleanMessageContent = (msg: IMessage): string => {
    let content = msg.content;

    // Replace user mentions <@123456> with @username
    // Use the username from the mentions.users array (not message author)
    for (const user of msg.mentions.users) {
      const mentionPattern = new RegExp(`<@!?${user.id}>`, 'g');
      content = content.replace(mentionPattern, `@${user.username}`);
    }

    return content;
  };

  // If this is a bot message, capture to memory but don't process
  if (message.author.bot) {
    // Only capture regular message types (0 = Default, 19 = Reply)
    // Skip system messages like channel name changes, pins, etc.
    if (message.type === 0 || message.type === 19) {
      try {
        const { memoryManager } = await import('../memory/manager.js');
        const botName = message.author.username || 'claudebot';
        const cleanContent = cleanMessageContent(message);

        if (message.channel.isThread()) {
          // Thread message
          memoryManager.addThreadReply(
            parentChannelId,
            message.channel.id,
            botName,
            cleanContent
          );
        } else {
          // Channel message
          memoryManager.addChannelMessage(
            parentChannelId,
            message.id,
            botName,
            cleanContent
          );
        }

        logger.info(`[Memory] Captured bot message (${cleanContent.length} chars)`);
      } catch (error) {
        logger.error('[Memory] Failed to capture bot message:', error);
      }
    }
    return; // Don't process bot messages further
  }

  // CAPTURE USER MESSAGE TO MEMORY (before mention filtering)
  // Do this for ALL user messages, regardless of mentions
  if (message.type === 0 || message.type === 19) {
    try {
      const { memoryManager } = await import('../memory/manager.js');
      const { logRawMemoryCaptured } = await import('../memory/logger.js');

      const displayName = message.member?.displayName || message.author.username;
      const cleanedContent = cleanMessageContent(message);

      // Add attachment info if present
      let finalContent = cleanedContent;
      if (message.attachments.size > 0) {
        const attachmentNames = Array.from(message.attachments.values())
          .map(att => att.name)
          .join(', ');
        finalContent = `${cleanedContent}\n\n[Files attached: ${attachmentNames}]`;
      }

      if (message.channel.isThread()) {
        // Thread message
        memoryManager.addThreadReply(
          parentChannelId,
          message.channel.id,
          displayName,
          finalContent
        );
      } else {
        // Channel message
        memoryManager.addChannelMessage(
          parentChannelId,
          message.id,
          displayName,
          finalContent
        );
      }

      await logRawMemoryCaptured(
        parentChannelId,
        finalContent.length,
        'pre-filter'
      );

      logger.info(`[Memory] Captured user message (${finalContent.length} chars)`);
    } catch (error) {
      logger.error('[Memory] Failed to capture user message:', error);
      // Don't block message processing on memory failure
    }
  }

  // MENTION FILTERING IN CHANNELS
  if (!message.channel.isThread()) {
    // In channel - only respond to mentions
    const botUser = message.client.user;
    if (!botUser) {
      return; // Bot user not available
    }
    const botMentioned = message.mentions.has(botUser.id);
    if (!botMentioned) {
      return; // Ignore non-mention messages
    }
  } else {
    // In thread - Let Claude handle responses, but buffer messages that mention others
      const threadId = message.channel.id;

      if (mentionsSomeoneElse(message)) {
        // Message mentions someone else - buffer it for context but don't respond
        const displayName = message.member?.displayName || message.author.username;
        const buffered: BufferedMessage = {
          author: displayName,
          content: message.content,
          timestamp: message.createdAt,
        };

        const buffer = messageBuffers.get(threadId) || [];
        buffer.push(buffered);
        messageBuffers.set(threadId, buffer);

        logger.info(`📝 Buffered message from ${displayName} (mentions someone else)`);
        return;
      }

    // Message doesn't mention others - process it (Claude will decide whether to respond)
    // Note: If bot is mentioned, we'll also process it
  }

  try {
    // Determine thread context
    let threadId: string;
    let targetForStream: ITextChannel | IThreadChannel;
    let thinkingMessage: IMessage | undefined;
    let isNewThread = false;

    if (message.channel.isThreadChannel()) {
      // User is replying in an existing thread
      threadId = message.channel.id;
      targetForStream = message.channel;
    } else {
      // User is writing in the channel - CREATE THREAD NOW (before calling Claude)
      // This ensures thread context is available when tools execute
      logger.info(`✨ Creating thread for new conversation`);

      // Create initial thread name from first 20 characters of message (with mentions replaced)
      // Claude will update it based on conversation, but this provides a better fallback
      const cleanedContent = cleanMessageContent(message);
      const threadName = cleanedContent.length > 20
        ? cleanedContent.substring(0, 20) + '...'
        : cleanedContent || 'New conversation';

      const thread = await (message.channel as ITextChannel).threads.create({
        name: threadName,
        autoArchiveDuration: 60,
        reason: 'Claude conversation',
        startMessage: message,
      });

      // Thread will stay empty until first message is sent
      // (thinking message was removed as it wasn't working well)

      threadId = thread.id;
      targetForStream = thread;
      isNewThread = true;

      logger.info(`✅ Thread created: ${thread.id}`);
    }

    // Determine session ID and working directory
    let sessionId: string;
    let isNew: boolean;
    let workingDir: string;

    // Get or create agent session tied to this thread
    // IMPORTANT: If we're in a thread with no existing session, only proceed if bot is mentioned
    if (message.channel.isThreadChannel()) {
      const existingSession = sessionManager.getSessionByThreadId(threadId);
      if (!existingSession) {
        // No existing session for this thread - check if bot is mentioned
        const botUser = message.client.user;
        if (!botUser) {
          return; // Bot user not available
        }
        const botMentioned = message.mentions.has(botUser.id);
        if (!botMentioned) {
          // Thread not created by bot and bot not mentioned - ignore
          logger.info(`⚠️  Ignoring message in thread ${threadId} - no active session and bot not mentioned`);
          return;
        }
      }
    }

    const result = await sessionManager.getOrCreateSession(
      threadId,
      parentChannelId,
      message.id,
      mapping.folderPath
    );

    sessionId = result.sessionId;
    isNew = result.isNew;
    workingDir = mapping.folderPath;

    if (!isNew) {
      logger.info(`📖 Resuming session ${sessionId} for thread ${threadId}`);
    } else {
      logger.info(`✨ Created new session ${sessionId} for thread ${threadId}`);
    }

    // Verify working directory exists and is accessible
    if (!context.fileStore.exists(workingDir)) {
      logger.error(`❌ Working directory does not exist: ${workingDir}`);
      logger.error(`   This likely means the persistent volume is not mounted.`);

      // Send error to the thread
      await targetForStream.send(
        `❌ Error: Working directory not found. Please check server configuration.`
      );
      return;
    } else {
      logger.info(`✓ Working directory exists: ${workingDir}`);
      // Check if CLAUDE.md exists in centralized location
      if (context.fileStore.exists(mapping.claudeMdPath)) {
        logger.info(`✓ CLAUDE.md found at ${mapping.claudeMdPath}`);
      } else {
        logger.info(`⚠️  CLAUDE.md not found at ${mapping.claudeMdPath}`);
      }
    }

    // Note: Channel context is already set above before creating the query

    // Set working directory context for built-in tools (cron, etc.)
    sessionManager.setWorkingDirContext(sessionId, workingDir);

    // Set channel ID context for cron tools (centralized storage)
    sessionManager.setChannelIdContext(sessionId, parentChannelId);

    try {
      // Handle attachments if present
      let userMessage = message.content;
      if (message.attachments.size > 0) {
        const attachmentResult = await processAttachments(message, workingDir, context, logger);
        userMessage = `${message.content}${formatAttachmentPrompt(attachmentResult)}`;
      }

      // Prefix with username for multi-user context
      const displayName = message.member?.displayName || message.author.username;

      // Include buffered messages as context (messages that mentioned others)
      const threadId = message.channel.isThread() ? message.channel.id : message.id;
      const buffer = messageBuffers.get(threadId);

      if (buffer && buffer.length > 0) {
        // Format buffered messages as context
        const contextMessages = buffer
          .map(msg => `[${msg.author}]: ${msg.content}`)
          .join('\n');

        userMessage = `${contextMessages}\n[${displayName}]: ${userMessage}`;

        // Clear the buffer
        messageBuffers.delete(threadId);
        logger.info(`📝 Included ${buffer.length} buffered message(s) as context`);
      } else {
        userMessage = `[${displayName}]: ${userMessage}`;
      }

      // Memory capture already happened earlier (before mention filtering)

      // Get CLAUDE.md path from mapping
      const channelMapping = getChannelMapping(parentChannelId, channelMappings);
      if (!channelMapping) {
        logger.error(`❌ No channel mapping found for ${parentChannelId}`);
        return;
      }

      const claudeMdPath = channelMapping.claudeMdPath;
      let systemPrompt: string | undefined;

      let memoryTokens = 0;
      if (context.fileStore.exists(claudeMdPath)) {
        try {
          // Get all channel info
          const allChannels = channelMappings.map(m => ({
            channelId: m.channelId,
            channelName: m.channelName,
          }));

          const memoryResult = await sessionManager.populateMemory(
            claudeMdPath,
            parentChannelId,
            mapping.channelName,
            allChannels,
            sessionId
          );
          memoryTokens = memoryResult.totalTokens;
          logger.info(`💾 Memory loaded: ${memoryTokens} tokens`);

          // Read server description if it exists
          const serverDescPath = path.join(workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
          let serverDescription: string | undefined;
          if (context.fileStore.exists(serverDescPath)) {
            const rawDesc = context.fileStore.readFile(serverDescPath, 'utf-8');
            // Extract just the description content (skip the "# Server Description" header)
            serverDescription = rawDesc.replace(/^# Server Description\s*\n+/, '').trim();
            logger.info(`📖 Read SERVER_DESCRIPTION.md`);
          }

          // Read channel topic from CLAUDE.md
          const claudeMdContent = context.fileStore.readFile(claudeMdPath, 'utf-8');
          // Extract topic from "## Channel Topic" section
          const topicMatch = claudeMdContent.match(/## Channel Topic\s*\n+([^\n#]+)/);
          const channelTopic = topicMatch?.[1]?.trim();

          // Build system prompt from template
          const { buildSystemPrompt } = await import('../prompts/base-system-prompt.js');
          systemPrompt = buildSystemPrompt({
            serverDescription,
            channelName: mapping.channelName,
            channelTopic: channelTopic && channelTopic !== '_No topic set_' ? channelTopic : undefined,
          });

          logger.info(`📖 Built system prompt from template (${systemPrompt.length} chars)`);
        } catch (memoryError) {
          logger.error('Failed to populate memory or read CLAUDE.md:', memoryError);
          // Continue anyway - memory is nice-to-have, not critical
        }
      } else {
        logger.warn(`⚠️  CLAUDE.md not found at ${claudeMdPath}`);
      }

      // For new threads, append critical instruction to update thread name
      if (isNewThread && systemPrompt) {
        systemPrompt += `\n\n## CRITICAL: Thread Naming Requirement\n\n**YOU MUST call the \`discord_update_thread_name\` tool as your FIRST action in this conversation.**\n\nThis is a new thread and REQUIRES a descriptive name. Generate a concise, descriptive thread name (max 100 characters) that captures the essence of what the user is asking about or discussing. Do this BEFORE responding to the user.\n\nThe thread name should be:\n- Concise and clear (aim for 3-8 words)\n- Descriptive of the topic/question\n- Professional and organized\n\nDo NOT acknowledge that you're updating the thread name - just do it silently as your first tool call, then respond normally to the user's message.`;
      } else if (isNewThread) {
        // Fallback if no system prompt exists
        systemPrompt = `## CRITICAL: Thread Naming Requirement\n\n**YOU MUST call the \`discord_update_thread_name\` tool as your FIRST action in this conversation.**\n\nThis is a new thread and REQUIRES a descriptive name. Generate a concise, descriptive thread name (max 100 characters) that captures the essence of what the user is asking about or discussing. Do this BEFORE responding to the user.\n\nThe thread name should be:\n- Concise and clear (aim for 3-8 words)\n- Descriptive of the topic/question\n- Professional and organized\n\nDo NOT acknowledge that you're updating the thread name - just do it silently as your first tool call, then respond normally to the user's message.`;
      }

      // Check query limit BEFORE processing
      if (queryLimitManager) {
        const canProceed = await queryLimitManager.canProceedWithQuery();
        if (!canProceed) {
          await targetForStream.send(
            '⚠️ Query limit reached. Please upgrade your plan to continue using the bot.'
          );
          return;
        }
      }

      // Set channel context BEFORE creating query
      // This ensures tools like schedule_add have access to thread context
      sessionManager.setChannelContext(sessionId, targetForStream);
      sessionManager.setWorkingDirContext(sessionId, workingDir);
      sessionManager.setChannelIdContext(sessionId, parentChannelId);

      // Create query for Claude
      // For new sessions, pass null to let SDK create a fresh session
      // For existing sessions, pass the real SDK session ID to resume
      let queryResult;
      let success = false;
      let cost = 0;

      try {
        queryResult = sessionManager.createQuery(
          userMessage,
          isNew ? null : sessionId,
          workingDir,
          systemPrompt
        );
      } catch (queryError) {
        logger.error('Error creating query:', queryError);
        await targetForStream.send(
          `❌ Failed to create query: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`
        );
        return;
      }

      // Stream response from Claude agent to Discord
      try {
        const streamResult = await streamToDiscord(
          queryResult,
          targetForStream,
          sessionManager,
          sessionId,
          workingDir,
          logger,
          botConfig,
          undefined, // messagePrefix
          parentChannelId, // Pass parent channel ID for memory operations
          undefined, // isCronJob
          thinkingMessage, // thinkingMessageToDelete
          mapping.channelName // NEW: parentChannelName for server-wide memory
        );
        success = true;
        cost = estimateQueryCost(streamResult);
      } catch (streamError) {
        logger.error('Error streaming to Discord:', streamError);

        // Send error to the thread
        await targetForStream.send(
          `❌ Failed to stream response: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`
        );
      } finally {
        // Track query usage
        if (queryLimitManager) {
          await queryLimitManager.trackQuery('discord_message', cost, success, memoryTokens);
        }
      }
    } finally {
      // Clear contexts after execution - wrap in try/catch to prevent cleanup errors
      try {
        sessionManager.clearChannelContext(sessionId);
        sessionManager.clearWorkingDirContext(sessionId);
        sessionManager.clearChannelIdContext(sessionId);
      } catch (cleanupError) {
        logger.error('Error during context cleanup:', cleanupError);
      }
    }
  } catch (error) {
    logger.error('Error handling message:', error);

    // Try to send error message to user
    try {
      await message.reply(
        `❌ Sorry, I encountered an error processing your message: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } catch (replyError) {
      logger.error('Failed to send error message to user:', replyError);
    }
  }
}

/**
 * Check if message mentions someone other than the bot
 */
function mentionsSomeoneElse(message: IMessage): boolean {
  const botId = message.client.user?.id;
  if (!botId) return false;

  // Check for @mentions of other users
  const mentionsOthers = message.mentions.users.some(user => user.id !== botId && !user.bot);

  return mentionsOthers;
}

/**
 * Handle /workspace slash command
 */
async function handleWorkspaceCommand(
  interaction: IChatInputCommandInteraction,
  context: IBotContext,
  workspaceRoot: string,
  logger: ILogger,
  baseUrl: string
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const cordbotPath = path.join(workspaceRoot, 'cordbot');
    const token = context.workspaceShareManager.createWorkspaceToken(
      cordbotPath,
      interaction.channelId
    );

    const guildId = process.env.DISCORD_GUILD_ID || '';
    const workspaceUrl = `${baseUrl}/workspace/${guildId}/${token}`;

    await interaction.editReply({
      content:
        `📁 [**Open Cordbot Workspace**](${workspaceUrl})\n\n` +
        `*Link expires in 1 hour (extends on activity)*`,
    });

    logger.info(`✅ Created workspace link for channel ${interaction.channelId}`);
  } catch (error) {
    logger.error('Error handling /workspace command:', error);

    try {
      await interaction.editReply({
        content: '❌ Failed to create workspace link. Please try again.',
      });
    } catch (replyError) {
      logger.error('Failed to send error reply:', replyError);
    }
  }
}

/**
 * Estimate query cost from response
 * Returns cost in dollars
 */
function estimateQueryCost(response: any): number {
  // If response has usage.total_cost, use it directly
  if (response?.usage?.total_cost) {
    return response.usage.total_cost;
  }

  // Fallback estimation based on tokens
  const inputTokens = response?.usage?.input_tokens || 0;
  const outputTokens = response?.usage?.output_tokens || 0;

  // Claude Sonnet 4.5 pricing (as of implementation)
  // Input: $3 per 1M tokens = $0.000003 per token
  // Output: $15 per 1M tokens = $0.000015 per token
  const inputCost = inputTokens * 0.000003;
  const outputCost = outputTokens * 0.000015;

  return inputCost + outputCost;
}
