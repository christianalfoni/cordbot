import { Client, Message, TextChannel, ThreadChannel, GuildChannel, Interaction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { SessionManager } from '../agent/manager.js';
import { streamToDiscord } from '../agent/stream.js';
import { ChannelMapping, getChannelMapping, syncNewChannel, updateChannelClaudeMdTopic } from './sync.js';
import { CronRunner } from '../scheduler/runner.js';
import { DiscordPermissionManager } from '../permissions/discord.js';

// Global permission manager instance
export const permissionManager = new DiscordPermissionManager();

// Queue to prevent concurrent processing of messages in the same thread
const threadLocks = new Map<string, Promise<void>>();

export function setupEventHandlers(
  client: Client,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[],
  basePath: string,
  guildId: string,
  cronRunner: CronRunner
): void {
  // Handle new messages
  client.on('messageCreate', async (message) => {
    await handleMessageWithLock(message, sessionManager, channelMappings);
  });

  // Handle new channels being created
  client.on('channelCreate', async (channel) => {
    // Only handle text channels in the configured guild
    if (!(channel instanceof TextChannel)) return;
    if (channel.guildId !== guildId) return;

    try {
      console.log(`\n🆕 New channel detected: #${channel.name}`);

      // Sync the new channel
      const mapping = await syncNewChannel(channel, basePath);

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
  channelMappings: ChannelMapping[]
): Promise<void> {
  // Determine thread ID for locking
  const threadId = message.channel.isThread()
    ? message.channel.id
    : message.id; // For new threads, use message ID temporarily

  // Wait for any existing processing on this thread to complete
  const existingLock = threadLocks.get(threadId);
  if (existingLock) {
    await existingLock;
  }

  // Create new lock for this message
  const newLock = handleMessage(message, sessionManager, channelMappings)
    .finally(() => {
      // Remove lock when done
      if (threadLocks.get(threadId) === newLock) {
        threadLocks.delete(threadId);
      }
    });

  threadLocks.set(threadId, newLock);
  await newLock;
}

async function handleMessage(
  message: Message,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[]
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

  try {
    // Check if there's a pending cron session for this channel
    let pendingCronSession: any = null;
    if (!message.channel.isThread()) {
      pendingCronSession = sessionManager.getPendingCronSession(parentChannelId);
    }

    // Determine thread context
    let threadId: string;
    let threadChannel: TextChannel | ThreadChannel;

    if (message.channel.isThread()) {
      // User is replying in an existing thread
      threadId = message.channel.id;
      threadChannel = message.channel as ThreadChannel;
    } else {
      // User is writing in the channel - create a new thread
      const textChannel = message.channel as TextChannel;

      // Create thread name from message content
      const threadName = `${message.author.username}: ${message.content.slice(0, 50)}${
        message.content.length > 50 ? '...' : ''
      }`;

      const thread = await textChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440, // 24 hours
        reason: 'Claude conversation',
        startMessage: message,
      });

      threadId = thread.id;
      threadChannel = thread;
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
    }

    // Set channel context for permission requests
    sessionManager.setChannelContext(sessionId, threadChannel);

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

      // Create query for Claude
      // For new sessions, pass null to let SDK create a fresh session
      // For existing sessions, pass the real SDK session ID to resume
      const queryResult = sessionManager.createQuery(
        userMessage,
        isNew ? null : sessionId,
        workingDir
      );

      // Stream response from Claude agent to Discord
      await streamToDiscord(queryResult, threadChannel, sessionManager, sessionId, workingDir);
    } finally {
      // Clear contexts after execution
      sessionManager.clearChannelContext(sessionId);
      sessionManager.clearWorkingDirContext(sessionId);
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
