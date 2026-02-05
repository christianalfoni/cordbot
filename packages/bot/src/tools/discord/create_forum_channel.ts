import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';

const schema = z.object({
  name: z.string().describe('Forum channel name'),
  topic: z.string().optional().describe('Forum channel topic/description'),
  tags: z.array(z.string()).optional().describe('Available tags for forum posts'),
});

export function createCreateForumChannelTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_forum_channel',
    'Create a forum channel (requires permission)',
    schema.shape,
    async ({ name, topic, tags }) => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        const channelOptions: any = {
          name,
          type: ChannelType.GuildForum,
        };

        if (topic) {
          channelOptions.topic = topic;
        }

        if (tags && tags.length > 0) {
          channelOptions.availableTags = tags.map(tag => ({ name: tag }));
        }

        const channel = await guild.channels.create(channelOptions);

        const tagsList = tags && tags.length > 0 ? `\n**Tags:** ${tags.join(', ')}` : '';

        return {
          content: [{
            type: 'text',
            text: `✅ Forum channel created: <#${channel.id}>${tagsList}`
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
