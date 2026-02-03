import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';

const schema = z.object({
  channelId: z.string().describe('The Discord channel ID'),
  content: z.string().describe('Message content to send'),
});

export function createSendMessageTool(client: Client) {
  return tool(
    'discord_send_message',
    'Send a message to a Discord channel',
    schema.shape,
    async ({ channelId, content }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid text channel' }],
            isError: true,
          };
        }

        await (channel as TextChannel).send(content);

        return {
          content: [{ type: 'text', text: `✅ Message sent to <#${channelId}>` }],
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
