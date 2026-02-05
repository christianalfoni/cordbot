import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';

const schema = z.object({
  name: z.string().describe('Channel name'),
  type: z.enum(['text', 'voice']).optional().describe('Channel type (default: text)'),
  topic: z.string().optional().describe('Channel topic/description'),
});

export function createCreateChannelTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_channel',
    'Create a new channel in the Discord server',
    schema.shape,
    async ({ name, type = 'text', topic }) => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        const channelType = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const newChannel = await guild.channels.create({
          name,
          type: channelType,
          topic: topic || undefined,
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Created ${type} channel: <#${newChannel.id}>`
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
