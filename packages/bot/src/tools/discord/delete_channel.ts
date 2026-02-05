import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  channelId: z.string().describe('The Discord channel ID to delete'),
});

export function createDeleteChannelTool(
  client: Client,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_delete_channel',
    'Delete a Discord channel (requires permission)',
    schema.shape,
    async ({ channelId }) => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          return {
            content: [{ type: 'text', text: 'Error: Channel not found' }],
            isError: true,
          };
        }

        const channelName = 'name' in channel ? channel.name : channelId;
        await channel.delete();

        return {
          content: [{ type: 'text', text: `✅ Deleted channel: ${channelName}` }],
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
