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
  // Create minimal CLAUDE.md with only channel-specific synced data
  let content = '';

  // Channel header
  content += `# Channel: #${channelName}\n\n`;

  // Channel topic (synced from Discord)
  if (discordTopic) {
    content += `## Channel Topic\n\n${discordTopic}\n`;
  } else {
    content += `## Channel Topic\n\n_No topic set_\n`;
  }

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

export async function updateChannelClaudeMdTopic(
  claudeMdPath: string,
  discordTopic: string
): Promise<void> {
  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const lines = content.split('\n');

  // Find the "## Channel Topic" heading and update it
  let updatedLines: string[] = [];
  let foundTopicHeading = false;
  let skipUntilNextSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Found the Channel Topic heading
    if (line.trim() === '## Channel Topic') {
      updatedLines.push(line);
      updatedLines.push('');

      // Add updated topic
      if (discordTopic) {
        updatedLines.push(discordTopic);
      } else {
        updatedLines.push('_No topic set_');
      }

      foundTopicHeading = true;
      skipUntilNextSection = true;
      continue;
    }

    // Skip lines until we hit the next section (heading starting with #) or end of file
    if (skipUntilNextSection) {
      if (line.startsWith('#')) {
        // Hit next section, stop skipping
        skipUntilNextSection = false;
        updatedLines.push(line);
      }
      // Otherwise skip this line (it's part of the old topic content)
      continue;
    }

    // Keep all other lines
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
    allChannels,
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
