import { Client, Message, TextChannel, ThreadChannel, GuildChannel, Interaction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { SessionManager } from '../agent/manager.js';
import { streamToDiscord } from '../agent/stream.js';
import { ChannelMapping, getChannelMapping, syncNewChannel, updateChannelClaudeMdTopic, BotConfig } from './sync.js';
import { CronRunner } from '../scheduler/runner.js';
import { DiscordPermissionManager } from '../permissions/discord.js';

// Global permission manager instance
export const permissionManager = new DiscordPermissionManager();

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
  client: Client,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  basePath: string,
  guildId: string,
  cronRunner: CronRunner,
  botConfig?: BotConfig
): void {
  // Handle new messages
  client.on('messageCreate', async (message) => {
    try {
      await handleMessageWithLock(message, sessionManager, channelMappings, botConfig);
    } catch (error) {
      console.error('❌ Fatal error in messageCreate handler:', error);
      // Try to notify the user
      try {
        await message.reply(
          `❌ Sorry, I encountered a critical error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      } catch (replyError) {
        console.error('Failed to send error notification:', replyError);
      }
    }
  });

  // Handle new channels being created
  client.on('channelCreate', async (channel) => {
    // Only handle text channels in the configured guild
    if (!(channel instanceof TextChannel)) return;
    if (channel.guildId !== guildId) return;

    try {
      console.log(`\n🆕 New channel detected: #${channel.name}`);

      // Sync the new channel
      const mapping = await syncNewChannel(channel, basePath, botConfig);

      // Add to mappings array so it's immediately available
      channelMappings.push(mapping);

      // Start watching the cron file for this channel
      cronRunner.addChannel(mapping);

      console.log(`✅ Channel #${channel.name} synced and ready\n`);
    } catch (error) {
      console.error(`❌ Error syncing new channel #${channel.name}:`, error);
    }
  });

  // Handle channels being deleted
  client.on('channelDelete', async (channel) => {
    // Only handle text channels in the configured guild
    if (!(channel instanceof TextChannel)) return;
    if (channel.guildId !== guildId) return;

    try {
      console.log(`\n🗑️  Channel deleted: #${channel.name}`);

      // Find the mapping for this channel
      const mappingIndex = channelMappings.findIndex(m => m.channelId === channel.id);

      if (mappingIndex === -1) {
        console.log(`Channel #${channel.name} was not synced, skipping cleanup`);
        return;
      }

      const mapping = channelMappings[mappingIndex];

      // Stop watching the cron file
      cronRunner.removeChannel(channel.id);

      // Remove from mappings array
      channelMappings.splice(mappingIndex, 1);

      // Delete the folder if it exists
      if (fs.existsSync(mapping.folderPath)) {
        fs.rmSync(mapping.folderPath, { recursive: true, force: true });
        console.log(`📁 Deleted folder: ${mapping.folderPath}`);
      }

      console.log(`✅ Channel #${channel.name} cleanup complete\n`);
    } catch (error) {
      console.error(`❌ Error cleaning up channel #${channel.name}:`, error);
    }
  });

  // Handle channel updates (e.g., topic changes)
  client.on('channelUpdate', async (oldChannel, newChannel) => {
    // Only handle text channels in the configured guild
    if (!(newChannel instanceof TextChannel)) return;
    if (newChannel.guildId !== guildId) return;

    // Check if topic changed
    const oldTopic = (oldChannel as TextChannel).topic || '';
    const newTopic = newChannel.topic || '';

    if (oldTopic !== newTopic) {
      const mapping = getChannelMapping(newChannel.id, channelMappings);

      if (mapping) {
        try {
          console.log(`\n📝 Topic updated for #${newChannel.name}`);
          await updateChannelClaudeMdTopic(mapping.claudeMdPath, newTopic);
          console.log(`✅ Synced topic to CLAUDE.md\n`);
        } catch (error) {
          console.error(`❌ Error syncing topic for #${newChannel.name}:`, error);
        }
      }
    }
  });

  // Handle errors
  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  // Handle warnings
  client.on('warn', (warning) => {
    console.warn('Discord client warning:', warning);
  });

  // Handle button interactions for permissions
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    if (customId.startsWith('permission_')) {
      // Parse customId - handle underscores in requestId
      const parts = customId.split('_');
      const [, action, ...requestIdParts] = parts;
      const requestId = requestIdParts.join('_'); // Rejoin in case requestId has underscores
      const approved = action === 'approve';

      // Try to handle the permission response
      const handled = permissionManager.handlePermissionResponse(requestId, approved);

      if (handled) {
        // Successfully handled - update the message
        await interaction.update({
          content: `${interaction.message.content}\n\n${approved ? '✅ Approved' : '❌ Denied'}`,
          components: [], // Remove buttons
        });
      } else {
        // Not found or already handled - respond ephemerally
        await interaction.reply({
          content: '⚠️ This permission request has already been handled or expired.',
          ephemeral: true,
        });
      }
    }
  });
}

async function handleMessageWithLock(
  message: Message,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  botConfig?: BotConfig
): Promise<void> {
  // Determine thread ID for locking
  const threadId = message.channel.isThread()
    ? message.channel.id
    : message.id; // For new threads, use message ID temporarily

  try {
    // Wait for any existing processing on this thread to complete
    const existingLock = threadLocks.get(threadId);
    if (existingLock) {
      await existingLock.catch(() => {
        // Ignore errors from previous lock - we'll try again
        console.log(`Previous lock for ${threadId} failed, continuing anyway`);
      });
    }

    // Create new lock for this message
    const newLock = handleMessage(message, sessionManager, channelMappings, botConfig)
      .finally(() => {
        // Remove lock when done
        try {
          if (threadLocks.get(threadId) === newLock) {
            threadLocks.delete(threadId);
          }
        } catch (error) {
          console.error('Error removing lock:', error);
        }
      });

    threadLocks.set(threadId, newLock);
    await newLock;
  } catch (error) {
    console.error(`Error in handleMessageWithLock for ${threadId}:`, error);
    throw error; // Re-throw so outer handler can notify user
  }
}

async function handleMessage(
  message: Message,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  botConfig?: BotConfig
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

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

  // SHARED MODE FILTERING
  if (botConfig?.mode === 'shared') {
    if (!message.channel.isThread()) {
      // In channel - only respond to mentions
      const botMentioned = message.mentions.has(message.client.user!);
      if (!botMentioned) {
        return; // Ignore non-mention messages
      }
    } else {
      // In thread - new approach: Let Claude handle responses, but buffer messages that mention others
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

        console.log(`📝 Buffered message from ${displayName} (mentions someone else)`);
        return;
      }

      // Message doesn't mention others - process it (Claude will decide whether to respond)
      // Note: If bot is mentioned, we'll also process it
    }
  }

  try {
    // Check if there's a pending cron session for this channel
    let pendingCronSession: any = null;
    if (!message.channel.isThread()) {
      pendingCronSession = sessionManager.getPendingCronSession(parentChannelId);
    }

    // Determine thread context
    let threadId: string;
    let targetForStream: ThreadChannel | TextChannel | Message;

    if (message.channel.isThread()) {
      // User is replying in an existing thread
      threadId = message.channel.id;
      targetForStream = message.channel as ThreadChannel;
    } else {
      // User is writing in the channel - defer thread creation
      // Pass message to streamToDiscord for lazy creation
      threadId = `pending-${message.id}`;
      targetForStream = message;
    }

    // Determine session ID and working directory
    let sessionId: string;
    let isNew: boolean;
    let workingDir: string;

    if (pendingCronSession) {
      // Continue the cron session in this new thread
      sessionId = pendingCronSession.sessionId;
      workingDir = pendingCronSession.workingDir;
      isNew = false;

      // Map the thread to the existing cron session
      sessionManager.createMappingWithSessionId(
        threadId,
        parentChannelId,
        message.id,
        sessionId,
        workingDir
      );

      console.log(`🔗 Continuing cron session ${sessionId} in thread ${threadId}`);
    } else {
      // Normal flow: get or create agent session tied to this thread
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
        console.log(`📖 Resuming session ${sessionId} for thread ${threadId}`);
      } else {
        console.log(`✨ Created new session ${sessionId} for thread ${threadId}`);
      }

      // Verify working directory exists and is accessible
      if (!fs.existsSync(workingDir)) {
        console.error(`❌ Working directory does not exist: ${workingDir}`);
        console.error(`   This likely means the persistent volume is not mounted.`);

        // Send error to the appropriate target
        const errorTarget = targetForStream instanceof Message
          ? (targetForStream.channel as TextChannel)
          : targetForStream;

        await errorTarget.send(
          `❌ Error: Working directory not found. Please check server configuration.`
        );
        return;
      } else {
        console.log(`✓ Working directory exists: ${workingDir}`);
        // Check if CLAUDE.md exists
        const claudeMdPath = path.join(workingDir, 'CLAUDE.md');
        if (fs.existsSync(claudeMdPath)) {
          console.log(`✓ CLAUDE.md found in working directory`);
        } else {
          console.log(`⚠️  CLAUDE.md not found in working directory`);
        }
      }
    }

    // Set channel context for permission requests
    // For lazy thread creation, use the message channel temporarily
    const contextChannel = targetForStream instanceof Message
      ? (targetForStream.channel as TextChannel)
      : targetForStream;
    sessionManager.setChannelContext(sessionId, contextChannel);

    // Set working directory context for built-in tools (cron, etc.)
    sessionManager.setWorkingDirContext(sessionId, workingDir);

    try {
      // Handle attachments if present
      let userMessage = message.content;
      if (message.attachments.size > 0) {
        const attachmentInfo = await downloadAttachments(message, workingDir);
        if (attachmentInfo.length > 0) {
          userMessage = `${message.content}\n\n[Files attached and saved to working directory: ${attachmentInfo.join(', ')}]`;
        }
      }

      // Prefix with username in shared mode
      if (botConfig?.mode === 'shared') {
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
          console.log(`📝 Included ${buffer.length} buffered message(s) as context`);
        } else {
          userMessage = `[${displayName}]: ${userMessage}`;
        }
      }

      // Populate memory section in CLAUDE.md before query
      const claudeMdPath = path.join(workingDir, 'CLAUDE.md');
      if (fs.existsSync(claudeMdPath)) {
        try {
          await sessionManager.populateMemory(claudeMdPath, parentChannelId, sessionId);
          console.log(`💾 Memory populated for channel ${parentChannelId}`);
        } catch (memoryError) {
          console.error('Failed to populate memory:', memoryError);
          // Continue anyway - memory is nice-to-have, not critical
        }
      }

      // Create query for Claude
      // For new sessions, pass null to let SDK create a fresh session
      // For existing sessions, pass the real SDK session ID to resume
      let queryResult;
      try {
        queryResult = sessionManager.createQuery(
          userMessage,
          isNew ? null : sessionId,
          workingDir
        );
      } catch (queryError) {
        console.error('Error creating query:', queryError);
        const errorTarget = targetForStream instanceof Message
          ? (targetForStream.channel as TextChannel)
          : targetForStream;
        await errorTarget.send(
          `❌ Failed to create query: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`
        );
        return;
      }

      // Stream response from Claude agent to Discord
      try {
        await streamToDiscord(
          queryResult,
          targetForStream,
          sessionManager,
          sessionId,
          workingDir,
          botConfig,
          undefined, // messagePrefix
          parentChannelId // Pass parent channel ID for memory operations
        );
      } catch (streamError) {
        console.error('Error streaming to Discord:', streamError);

        // Send error to the appropriate target
        const errorTarget = targetForStream instanceof Message
          ? (targetForStream.channel as TextChannel)
          : targetForStream;

        await errorTarget.send(
          `❌ Failed to stream response: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`
        );
      }
    } finally {
      // Clear contexts after execution - wrap in try/catch to prevent cleanup errors
      try {
        sessionManager.clearChannelContext(sessionId);
        sessionManager.clearWorkingDirContext(sessionId);
      } catch (cleanupError) {
        console.error('Error during context cleanup:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);

    // Try to send error message to user
    try {
      await message.reply(
        `❌ Sorry, I encountered an error processing your message: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
    }
  }
}

async function downloadAttachments(message: Message, workingDir: string): Promise<string[]> {
  const attachmentNames: string[] = [];

  for (const attachment of message.attachments.values()) {
    try {
      // Fetch the attachment
      const response = await fetch(attachment.url);
      if (!response.ok) {
        console.error(`Failed to download attachment ${attachment.name}: ${response.statusText}`);
        continue;
      }

      // Get the file content
      const buffer = Buffer.from(await response.arrayBuffer());

      // Save to channel folder (overwrite if exists)
      const filePath = path.join(workingDir, attachment.name);
      fs.writeFileSync(filePath, buffer);

      attachmentNames.push(attachment.name);
      console.log(`📎 Downloaded attachment: ${attachment.name} (${buffer.length} bytes)`);
    } catch (error) {
      console.error(`Failed to download attachment ${attachment.name}:`, error);
    }
  }

  return attachmentNames;
}

/**
 * Check if message mentions someone other than the bot
 */
function mentionsSomeoneElse(message: Message): boolean {
  const botId = message.client.user!.id;

  // Check for @mentions of other users
  const mentionsOthers = message.mentions.users.some(user => user.id !== botId && !user.bot);

  return mentionsOthers;
}
