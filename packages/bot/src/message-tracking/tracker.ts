import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Message } from 'discord.js';

export interface TrackedMessage {
  messageId: string;
  channelId: string;
  channelName: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  mentions: string[];
  attachmentCount: number;
  embedCount: number;
}

/**
 * Track a public message from Discord
 * Stores in ~/.claude/channels/{channelId}/messages/raw/{date}.jsonl
 */
export async function trackMessage(message: Message): Promise<void> {
  const homeDir = os.homedir();
  const channelName = message.channel.isTextBased() && 'name' in message.channel
    ? message.channel.name
    : 'unknown';

  const record: TrackedMessage = {
    messageId: message.id,
    channelId: message.channelId,
    channelName: channelName || 'unknown',
    authorId: message.author.id,
    authorName: message.author.username,
    content: message.content,
    timestamp: new Date().toISOString(),
    mentions: message.mentions.users.map(u => u.username),
    attachmentCount: message.attachments.size,
    embedCount: message.embeds.length,
  };

  // Store in channel's messages directory
  const messagesPath = path.join(
    homeDir,
    '.claude',
    'channels',
    message.channelId,
    'messages',
    'raw'
  );

  await fs.mkdir(messagesPath, { recursive: true });

  // Append to today's JSONL file
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(messagesPath, `${today}.jsonl`);

  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
}
