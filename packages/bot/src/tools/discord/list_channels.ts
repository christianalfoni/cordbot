import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';

const schema = z.object({});

export function createListChannelsTool(client: Client) {
  return tool(
    'discord_list_channels',
    'List all channels in the Discord server',
    schema.shape,
    async () => {
      try {
        const guild = client.guilds.cache.first();

        if (!guild) {
          return {
            content: [{ type: 'text', text: 'Error: No guild found' }],
            isError: true,
          };
        }

        const channels = guild.channels.cache
          .filter(channel => !channel.isThread())
          .map(channel => ({
            id: channel.id,
            name: channel.name,
            type: ChannelType[channel.type],
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const channelList = channels
          .map(ch => `- **${ch.name}** (${ch.type}) - ID: ${ch.id}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Channels in ${guild.name}**\n\n${channelList}`
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
