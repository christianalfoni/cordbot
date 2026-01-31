import { Client, TextChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';
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

  for (const [, channel] of channels) {
    if (!(channel instanceof TextChannel)) continue;

    const channelName = channel.name;
    const folderPath = path.join(basePath, channelName);
    const claudeMdPath = path.join(folderPath, 'CLAUDE.md');
    const cronPath = path.join(folderPath, '.claude-cron');
    const claudeFolderPath = path.join(folderPath, '.claude');
    const skillsPath = path.join(claudeFolderPath, 'skills');

    // Create folder structure if it doesn't exist
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`📁 Created folder for #${channelName}`);
    }

    if (!fs.existsSync(skillsPath)) {
      fs.mkdirSync(skillsPath, { recursive: true });
      console.log(`📁 Created .claude/skills for #${channelName}`);
    }

    // Create CLAUDE.md if missing and sync Discord topic to it (one-way sync)
    if (!fs.existsSync(claudeMdPath)) {
      await createChannelClaudeMd(claudeMdPath, channelName, channel.topic || '', botConfig);
      console.log(`📄 Created CLAUDE.md for #${channelName}`);
    } else {
      // Update existing CLAUDE.md with Discord topic
      await updateChannelClaudeMdTopic(claudeMdPath, channel.topic || '');
    }

    // Create empty .claude-cron if missing (Claude will manage via skill)
    if (!fs.existsSync(cronPath)) {
      fs.writeFileSync(cronPath, 'jobs: []\n', 'utf-8');
      console.log(`⏰ Created .claude-cron for #${channelName}`);
    }

    // Copy cron management skill to .claude/skills
    const skillTemplatePath = path.join(__dirname, '..', '..', 'templates', 'cron-skill.md');
    const skillDestPath = path.join(skillsPath, 'cron.md');
    if (!fs.existsSync(skillDestPath)) {
      fs.copyFileSync(skillTemplatePath, skillDestPath);
      console.log(`🔧 Added cron management skill for #${channelName}`);
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
  // Create CLAUDE.md with Discord topic and bot identity
  let content = `# ${channelName}\n\n`;

  if (discordTopic) {
    content += `> ${discordTopic}\n\n`;
  }

  if (botConfig) {
    content += `## Bot Identity\n\n`;
    content += `You are **${botConfig.username}**, a Discord bot assistant.\n\n`;

    if (botConfig.mode === 'shared') {
      content += `**Shared Mode**: Users @mention you for help. `;
      content += `In single-user threads, respond to all messages. `;
      content += `In multi-user threads, only respond when @mentioned. `;
      content += `Messages are prefixed with [username].\n\n`;
    } else {
      content += `**Personal Mode**: You respond to all messages in synced channels.\n\n`;
    }
  }

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

export async function updateChannelClaudeMdTopic(
  claudeMdPath: string,
  discordTopic: string
): Promise<void> {
  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const lines = content.split('\n');

  // Find or update the topic line (should be after the heading)
  let updatedLines: string[] = [];
  let foundHeading = false;
  let foundTopic = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!foundHeading && line.trim().startsWith('#')) {
      updatedLines.push(line);
      updatedLines.push('');
      if (discordTopic) {
        updatedLines.push(`> ${discordTopic}`);
        updatedLines.push('');
      }
      foundHeading = true;
      foundTopic = true;
      continue;
    }

    // Skip old topic line
    if (foundHeading && !foundTopic && line.trim().startsWith('>')) {
      foundTopic = true;
      if (discordTopic) {
        updatedLines.push(`> ${discordTopic}`);
      }
      continue;
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
  const channelName = channel.name;
  const folderPath = path.join(basePath, channelName);
  const claudeMdPath = path.join(folderPath, 'CLAUDE.md');
  const cronPath = path.join(folderPath, '.claude-cron');
  const claudeFolderPath = path.join(folderPath, '.claude');
  const skillsPath = path.join(claudeFolderPath, 'skills');

  // Create folder structure
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`📁 Created folder for #${channelName}`);
  }

  if (!fs.existsSync(skillsPath)) {
    fs.mkdirSync(skillsPath, { recursive: true });
    console.log(`📁 Created .claude/skills for #${channelName}`);
  }

  // Create CLAUDE.md
  if (!fs.existsSync(claudeMdPath)) {
    await createChannelClaudeMd(claudeMdPath, channelName, channel.topic || '', botConfig);
    console.log(`📄 Created CLAUDE.md for #${channelName}`);
  }

  // Create empty .claude-cron
  if (!fs.existsSync(cronPath)) {
    fs.writeFileSync(cronPath, 'jobs: []\n', 'utf-8');
    console.log(`⏰ Created .claude-cron for #${channelName}`);
  }

  // Copy cron management skill
  const skillTemplatePath = path.join(__dirname, '..', '..', 'templates', 'cron-skill.md');
  const skillDestPath = path.join(skillsPath, 'cron.md');
  if (!fs.existsSync(skillDestPath)) {
    fs.copyFileSync(skillTemplatePath, skillDestPath);
    console.log(`🔧 Added cron management skill for #${channelName}`);
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
  workspaceRoot: string,
  channelId: string,
  memoryContextSize: number,
  sessionId?: string
): Promise<void> {
  // Load memories for this channel
  const memoryResult = await loadMemoriesForChannel(workspaceRoot, channelId, memoryContextSize);

  // Format memories for CLAUDE.md
  const memoryContent = formatMemoriesForClaudeMd(memoryResult);

  // Read current CLAUDE.md
  let content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Check if memory section already exists
  const memoryStartMarker = '<!-- MEMORY_START -->';
  const memoryEndMarker = '<!-- MEMORY_END -->';

  if (content.includes(memoryStartMarker) && content.includes(memoryEndMarker)) {
    // Replace existing memory section
    const startIndex = content.indexOf(memoryStartMarker);
    const endIndex = content.indexOf(memoryEndMarker) + memoryEndMarker.length;

    const newMemorySection = `${memoryStartMarker}\n${memoryContent}\n${memoryEndMarker}`;
    content = content.substring(0, startIndex) + newMemorySection + content.substring(endIndex);
  } else {
    // Add new memory section after channel topic
    const lines = content.split('\n');
    let insertIndex = 0;

    // Find position after topic (after first heading and optional topic line)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#')) {
        insertIndex = i + 1;
        // Skip empty line and topic line if they exist
        if (i + 1 < lines.length && lines[i + 1].trim() === '') {
          insertIndex++;
        }
        if (insertIndex < lines.length && lines[insertIndex].trim().startsWith('>')) {
          insertIndex++;
        }
        break;
      }
    }

    // Insert memory section
    const memorySection = [
      '',
      memoryStartMarker,
      memoryContent,
      memoryEndMarker,
      '',
    ];

    lines.splice(insertIndex, 0, ...memorySection);
    content = lines.join('\n');
  }

  // Write updated content
  fs.writeFileSync(claudeMdPath, content, 'utf-8');

  // Log memory operation
  await logMemoryLoaded(
    workspaceRoot,
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
