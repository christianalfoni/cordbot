import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { loadMemoriesForChannel, formatMemoriesForClaudeMd, loadMemoriesForServer, formatMemoriesForServerWideClaudeMd } from '../memory/loader.js';
import { logMemoryLoaded } from '../memory/logger.js';
import type { IDiscordAdapter, ITextChannel } from '../interfaces/discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChannelMapping {
  channelId: string;
  channelName: string;
  folderPath: string;
  claudeMdPath: string;
}

export interface BotConfig {
  id: string;
  username: string;
}

export async function syncChannelsOnStartup(
  discord: IDiscordAdapter,
  guildId: string,
  workspaceRoot: string,
  workingDirectory: string,
  botConfig?: BotConfig
): Promise<{ mappings: ChannelMapping[]; cronPath: string }> {
  const guild = await discord.getGuild(guildId);

  if (!guild) {
    throw new Error(`Guild ${guildId} not found. Make sure the bot is added to the server.`);
  }

  console.log(`🔄 Syncing channels for guild: ${guild.name}`);

  // Sync server description to a file
  const serverDescPath = path.join(workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
  const serverDescDir = path.dirname(serverDescPath);
  if (!fs.existsSync(serverDescDir)) {
    fs.mkdirSync(serverDescDir, { recursive: true });
  }
  await updateServerDescription(serverDescPath, guild.description || '');
  console.log(`📄 Synced server description`);

  const mappings: ChannelMapping[] = [];

  // Fetch all text channels
  const channels = await discord.listChannels(guildId);
  const textChannels = channels.filter(ch => {
    // Filter for text channels only (type 0 is GuildText)
    return ch.type === 0;
  });

  // Ensure the shared working directory exists
  if (!fs.existsSync(workingDirectory)) {
    fs.mkdirSync(workingDirectory, { recursive: true });
    console.log(`📁 Created shared working directory: ${workingDirectory}`);
  }

  // Single shared cron.yaml file in the workspace root
  const cronPath = path.join(workspaceRoot, 'cron.yaml');
  if (!fs.existsSync(cronPath)) {
    fs.writeFileSync(cronPath, 'jobs: []\n', 'utf-8');
    console.log(`⏰ Created shared cron.yaml at ${cronPath}`);
  }

  for (const channel of textChannels) {
    // Type guard ensures this is ITextChannel
    if (!channel.isTextChannel()) continue;

    const channelName = channel.name;
    const folderPath = workingDirectory; // Shared working directory for all channels

    // Channel-specific config paths
    const channelClaudeDir = path.join(workspaceRoot, '.claude', 'channels', channel.id);
    const claudeMdPath = path.join(channelClaudeDir, 'CLAUDE.md');

    // Ensure directory exists for writing config files
    if (!fs.existsSync(channelClaudeDir)) {
      fs.mkdirSync(channelClaudeDir, { recursive: true });
    }

    // Create CLAUDE.md if missing and sync Discord topic to it (one-way sync)
    if (!fs.existsSync(claudeMdPath)) {
      await createChannelClaudeMd(claudeMdPath, channelName, channel.topic || '', botConfig);
      console.log(`📄 Created CLAUDE.md for #${channelName}`);
    } else {
      // Update existing CLAUDE.md with Discord topic
      await updateChannelClaudeMdTopic(claudeMdPath, channel.topic || '');
    }

    mappings.push({
      channelId: channel.id,
      channelName,
      folderPath,
      claudeMdPath,
    });
  }

  console.log(`✅ Synced ${mappings.length} channels`);

  return { mappings, cronPath };
}

async function createChannelClaudeMd(
  claudeMdPath: string,
  channelName: string,
  discordTopic: string,
  botConfig?: BotConfig
): Promise<void> {
  // Create CLAUDE.md with community assistant system prompt
  let content = '';

  // Header
  content += `# CordBot - Discord Community Assistant\n\n`;
  content += `You are CordBot, an AI assistant designed to help manage and support Discord communities.\n\n`;

  // Core Capabilities
  content += `## Your Core Capabilities\n\n`;

  // 1. Community Understanding
  content += `### 1. Community Understanding\n`;
  content += `- You track all public messages in this server\n`;
  content += `- You have access to recent message history per channel\n`;
  content += `- You can answer questions about recent discussions and activity patterns\n`;
  content += `- Ask you: "What have people been discussing?" or "Summarize today's activity"\n\n`;

  // 2. Discord Server Management
  content += `### 2. Discord Server Management\n`;
  content += `You have access to Discord management tools:\n\n`;

  content += `**Channels:**\n`;
  content += `- \`discord_list_channels\` - See all channels\n`;
  content += `- \`discord_send_message\` - Send message to any channel\n`;
  content += `- \`discord_create_channel\` - Create new channel\n`;
  content += `- \`discord_delete_channel\` - Delete channel (asks permission)\n\n`;

  content += `**Members:**\n`;
  content += `- \`discord_list_members\` - List server members\n`;
  content += `- \`discord_get_member\` - Get member info and roles\n`;
  content += `- \`discord_kick_member\` - Kick member (asks permission)\n`;
  content += `- \`discord_ban_member\` - Ban member (asks permission)\n\n`;

  content += `**Roles:**\n`;
  content += `- \`discord_list_roles\` - See all roles\n`;
  content += `- \`discord_assign_role\` - Assign role to member\n`;
  content += `- \`discord_remove_role\` - Remove role from member\n`;
  content += `- \`discord_create_role\` - Create new role\n\n`;

  content += `**Events:**\n`;
  content += `- \`discord_create_event\` - Schedule community events\n`;
  content += `- \`discord_list_events\` - See upcoming events\n`;
  content += `- \`discord_get_event\` - Get event details\n`;
  content += `- \`discord_delete_event\` - Cancel events (asks permission)\n`;
  content += `- \`discord_get_event_users\` - See who's attending\n\n`;

  content += `**Polls:**\n`;
  content += `- \`discord_create_poll\` - Create polls for decisions\n`;
  content += `- \`discord_get_poll_results\` - View poll results\n\n`;

  content += `**Forums:**\n`;
  content += `- \`discord_create_forum_channel\` - Create forum channels\n`;
  content += `- \`discord_list_forum_posts\` - List forum posts\n`;
  content += `- \`discord_create_forum_post\` - Create new forum posts\n`;
  content += `- \`discord_delete_forum_post\` - Delete forum posts (asks permission)\n\n`;

  content += `**Permission System:** You'll always ask for approval before:\n`;
  content += `- Creating or deleting channels\n`;
  content += `- Kicking or banning members\n`;
  content += `- Managing roles\n`;
  content += `- Creating or deleting events\n`;
  content += `- Creating polls or forum channels\n`;
  content += `- Deleting forum posts\n\n`;

  // 3. Workspace & Files
  content += `### 3. Workspace & Files\n`;
  content += `- You have access to a workspace directory for files\n`;
  content += `- You can create, read, edit, and manage files\n`;
  content += `- Share files back to Discord with the \`shareFile\` tool\n`;
  content += `- Organize project files, docs, or any community resources\n\n`;

  // 4. Scheduled Tasks
  content += `### 4. Scheduled Tasks\n`;
  content += `- Use cron tools to schedule recurring tasks\n`;
  content += `- Examples: daily announcements, reminders, automated reports\n`;
  content += `- Schedule format: cron syntax (e.g., "0 9 * * *" = 9 AM daily)\n\n`;

  // 5. Research & Information
  content += `### 5. Research & Information\n`;
  content += `- Search the web for information\n`;
  content += `- Help with coding, troubleshooting, research\n`;
  content += `- Provide answers and explanations\n`;
  content += `- Look up documentation and resources\n\n`;

  // Communication Style
  content += `## Communication Style\n`;
  content += `- Be friendly and conversational (not robotic)\n`;
  content += `- Respond naturally - you're a community member, not a command bot\n`;
  content += `- Use Discord markdown (bold, italic, code blocks, etc.)\n`;
  content += `- Ask clarifying questions when you need more context\n`;
  content += `- Be proactive in offering help, but not pushy\n\n`;

  // Your Role
  content += `## Your Role\n`;
  content += `You're here to make this community better. Help members stay informed, manage the server efficiently, and create a positive environment. Be helpful, respectful, and always ask before taking significant actions.\n`;

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

export async function updateChannelClaudeMdTopic(
  claudeMdPath: string,
  discordTopic: string
): Promise<void> {
  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const lines = content.split('\n');

  // Find the "## Channel Instructions" heading and update the topic
  let updatedLines: string[] = [];
  let foundChannelInstructions = false;
  let processedTopic = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Found the Channel Instructions heading
    if (!foundChannelInstructions && line.trim().startsWith('## Channel Instructions')) {
      updatedLines.push(line);
      updatedLines.push('');

      // Add topic if it exists
      if (discordTopic) {
        updatedLines.push(`> ${discordTopic}`);
        updatedLines.push('');
      }

      foundChannelInstructions = true;
      processedTopic = true;
      continue;
    }

    // Skip existing topic line (starts with >) if we just added the heading
    if (foundChannelInstructions && !processedTopic && line.trim().startsWith('>')) {
      processedTopic = true;
      continue;
    }

    // Skip empty lines right after topic was removed/updated
    if (foundChannelInstructions && !processedTopic && line.trim() === '') {
      processedTopic = true;
      if (!discordTopic) {
        continue; // Skip the empty line if no topic
      }
    }

    updatedLines.push(line);
  }

  fs.writeFileSync(claudeMdPath, updatedLines.join('\n'), 'utf-8');
}

export async function updateServerDescription(
  serverDescPath: string,
  description: string
): Promise<void> {
  // Create or update the server description file
  let content = '';

  if (description) {
    content = `# Server Description\n\n${description}\n`;
  } else {
    content = `# Server Description\n\n_No server description set_\n`;
  }

  fs.writeFileSync(serverDescPath, content, 'utf-8');
}

export function getChannelMapping(
  channelId: string,
  mappings: ChannelMapping[]
): ChannelMapping | undefined {
  return mappings.find(m => m.channelId === channelId);
}

export async function syncNewChannel(
  channel: ITextChannel,
  workspaceRoot: string,
  workingDirectory: string,
  botConfig?: BotConfig
): Promise<ChannelMapping> {
  const channelName = channel.name;
  const folderPath = workingDirectory; // Shared working directory for all channels

  // Ensure the shared working directory exists
  if (!fs.existsSync(workingDirectory)) {
    fs.mkdirSync(workingDirectory, { recursive: true });
    console.log(`📁 Created shared working directory: ${workingDirectory}`);
  }

  // Channel-specific config paths
  const channelClaudeDir = path.join(workspaceRoot, '.claude', 'channels', channel.id);
  const claudeMdPath = path.join(channelClaudeDir, 'CLAUDE.md');

  // Ensure directory exists for writing config files
  if (!fs.existsSync(channelClaudeDir)) {
    fs.mkdirSync(channelClaudeDir, { recursive: true });
  }

  // Create CLAUDE.md
  if (!fs.existsSync(claudeMdPath)) {
    await createChannelClaudeMd(claudeMdPath, channelName, channel.topic || '', botConfig);
    console.log(`📄 Created CLAUDE.md for #${channelName}`);
  }

  return {
    channelId: channel.id,
    channelName,
    folderPath,
    claudeMdPath,
  };
}

/**
 * Populate the memory section in CLAUDE.md for a channel (server-wide)
 * This should be called before each query to ensure memory is up-to-date
 */
export async function populateMemorySection(
  claudeMdPath: string,
  channelId: string,
  channelName: string,
  allChannels: Array<{ channelId: string; channelName: string }>,
  memoryContextSize: number,
  sessionId?: string
): Promise<import('../memory/loader.js').MemoryLoadResult> {
  // Load server-wide memories with current channel priority
  const memoryResult = await loadMemoriesForServer(
    channelId,
    channelName,
    allChannels.map(c => c.channelName),
    memoryContextSize
  );

  // Format memories with channel grouping
  const memoryContent = formatMemoriesForServerWideClaudeMd(
    memoryResult,
    channelName
  );

  // Read current CLAUDE.md
  let content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Check if memory sections already exist and remove them
  const hasRecentMemory = content.includes('## Recent Memory');
  const hasLongTermMemory = content.includes('## Long Term Memory');

  if (hasRecentMemory || hasLongTermMemory) {
    // Remove existing memory sections
    const lines = content.split('\n');
    const filteredLines: string[] = [];
    let skipUntilNextSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start skipping when we hit a memory section
      if (line.trim() === '## Recent Memory' || line.trim() === '## Long Term Memory') {
        skipUntilNextSection = true;
        continue;
      }

      // Stop skipping when we hit another ## section (but not ###)
      if (skipUntilNextSection && line.trim().startsWith('## ') && !line.trim().startsWith('### ')) {
        skipUntilNextSection = false;
      }

      if (!skipUntilNextSection) {
        filteredLines.push(line);
      }
    }

    content = filteredLines.join('\n').trimEnd();
  }

  // Append new memory content at the end if there is any
  if (memoryContent) {
    content = content.trimEnd() + '\n\n' + memoryContent;
  }

  // Write updated content
  fs.writeFileSync(claudeMdPath, content, 'utf-8');

  // Log memory operation
  await logMemoryLoaded(
    channelId,
    sessionId || 'unknown',
    memoryResult.memories.map(m => ({
      type: m.type,
      identifier: m.identifier,
      tokenCount: m.tokenCount,
    })),
    memoryResult.totalTokens,
    memoryResult.budgetUsed
  );

  return memoryResult;
}
