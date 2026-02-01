import { Client, TextChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { loadMemoriesForChannel, formatMemoriesForClaudeMd } from '../memory/loader.js';
import { logMemoryLoaded } from '../memory/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChannelMapping {
  channelId: string;
  channelName: string;
  folderPath: string;
  claudeMdPath: string;
  cronPath: string;
}

export interface BotConfig {
  mode: 'personal' | 'shared';
  id: string;
  username: string;
}

export async function syncChannelsOnStartup(
  client: Client,
  guildId: string,
  basePath: string,
  botConfig?: BotConfig
): Promise<ChannelMapping[]> {
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    throw new Error(`Guild ${guildId} not found. Make sure the bot is added to the server.`);
  }

  console.log(`🔄 Syncing channels for guild: ${guild.name}`);

  const mappings: ChannelMapping[] = [];

  // Fetch all text channels
  const channels = guild.channels.cache.filter(
    channel => channel.isTextBased() && !channel.isThread()
  );

  const homeDir = os.homedir();

  for (const [, channel] of channels) {
    if (!(channel instanceof TextChannel)) continue;

    const channelName = channel.name;
    const folderPath = path.join(basePath, channelName);

    // Centralized channel data directory
    const channelClaudeDir = path.join(homeDir, '.claude', 'channels', channel.id);
    const claudeMdPath = path.join(channelClaudeDir, 'CLAUDE.md');
    const cronPath = path.join(channelClaudeDir, 'cron.yaml');

    // Create channel folder (clean - just for work files)
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`📁 Created folder for #${channelName}`);
    }

    // Create centralized channel data directory
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

    // Create empty cron.yaml if missing (Claude will manage via skill)
    if (!fs.existsSync(cronPath)) {
      fs.writeFileSync(cronPath, 'jobs: []\n', 'utf-8');
      console.log(`⏰ Created cron.yaml for #${channelName}`);
    }

    mappings.push({
      channelId: channel.id,
      channelName,
      folderPath,
      claudeMdPath,
      cronPath,
    });
  }

  console.log(`✅ Synced ${mappings.length} channels`);

  return mappings;
}

async function createChannelClaudeMd(
  claudeMdPath: string,
  channelName: string,
  discordTopic: string,
  botConfig?: BotConfig
): Promise<void> {
  // Create CLAUDE.md with default bot instructions and channel-specific section
  let content = '';

  // General Instructions (merged with intro)
  content += `## General Instructions\n\n`;
  content += `You are a coding assistant running on a Discord server with access to a workspace. You help users and communities with whatever they need, including coding tasks, file operations, web searches, scheduling, and general assistance.\n\n`;
  content += `- You have access to a workspace where you can create, read, and modify files\n`;
  content += `- Execute tasks using the available tools\n\n`;

  // Communication Style
  content += `## Communication Style\n\n`;
  content += `When interacting with Discord users:\n`;
  content += `- Focus on **what** you're doing, not **how** you're doing it internally\n`;
  content += `- Do NOT mention specific tool names (Read, Write, Edit, Bash, Glob, Grep, WebFetch, etc.)\n`;
  content += `- Do NOT explain your internal processes or tool usage\n`;
  content += `- Simply describe the action in user-friendly terms\n`;
  content += `  - Instead of: "I'll use the Read tool to check the file"\n`;
  content += `  - Say: "Let me check that file"\n`;
  content += `  - Instead of: "I'll use WebSearch to find information"\n`;
  content += `  - Say: "Let me search for that information"\n`;
  content += `- Remember that most Discord users are not developers and don't need technical implementation details\n`;
  content += `- Keep responses conversational and focused on results\n\n`;

  // Channel-specific section
  content += `## Channel Instructions (#${channelName})\n\n`;

  // Only add topic if it exists
  if (discordTopic) {
    content += `> ${discordTopic}\n\n`;
  }

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

export function getChannelMapping(
  channelId: string,
  mappings: ChannelMapping[]
): ChannelMapping | undefined {
  return mappings.find(m => m.channelId === channelId);
}

export async function syncNewChannel(
  channel: TextChannel,
  basePath: string,
  botConfig?: BotConfig
): Promise<ChannelMapping> {
  const homeDir = os.homedir();
  const channelName = channel.name;
  const folderPath = path.join(basePath, channelName);

  // Centralized channel data directory
  const channelClaudeDir = path.join(homeDir, '.claude', 'channels', channel.id);
  const claudeMdPath = path.join(channelClaudeDir, 'CLAUDE.md');
  const cronPath = path.join(channelClaudeDir, 'cron.yaml');

  // Create channel folder (clean - just for work files)
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`📁 Created folder for #${channelName}`);
  }

  // Create centralized channel data directory
  if (!fs.existsSync(channelClaudeDir)) {
    fs.mkdirSync(channelClaudeDir, { recursive: true });
  }

  // Create CLAUDE.md
  if (!fs.existsSync(claudeMdPath)) {
    await createChannelClaudeMd(claudeMdPath, channelName, channel.topic || '', botConfig);
    console.log(`📄 Created CLAUDE.md for #${channelName}`);
  }

  // Create empty cron.yaml
  if (!fs.existsSync(cronPath)) {
    fs.writeFileSync(cronPath, 'jobs: []\n', 'utf-8');
    console.log(`⏰ Created cron.yaml for #${channelName}`);
  }

  return {
    channelId: channel.id,
    channelName,
    folderPath,
    claudeMdPath,
    cronPath,
  };
}

/**
 * Populate the memory section in CLAUDE.md for a channel
 * This should be called before each query to ensure memory is up-to-date
 */
export async function populateMemorySection(
  claudeMdPath: string,
  channelId: string,
  memoryContextSize: number,
  sessionId?: string
): Promise<void> {
  // Load memories for this channel
  const memoryResult = await loadMemoriesForChannel(channelId, memoryContextSize);

  // Format memories for CLAUDE.md
  const memoryContent = formatMemoriesForClaudeMd(memoryResult);

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
}
