import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  channelId: z.string().describe('The Discord channel ID to post the poll in'),
  question: z.string().describe('The poll question'),
  answers: z.array(z.string()).min(2).max(10).describe('Poll answer options (2-10 options)'),
  duration: z.number().optional().describe('Poll duration in hours (default: 24)'),
  allowMultiselect: z.boolean().optional().describe('Allow selecting multiple answers (default: false)'),
});

export function createCreatePollTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_create_poll',
    'Create a poll in a Discord channel (requires permission)',
    schema.shape,
    async ({ channelId, question, answers, duration = 24, allowMultiselect = false }) => {
      try {
        const contextChannel = getCurrentChannel();
        if (!contextChannel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            contextChannel,
            `Create a poll in <#${channelId}> with question: "${question}"?`,
            `create_poll_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: `❌ ${permError instanceof Error ? permError.message : 'Permission denied'}` }],
            isError: true,
          };
        }

        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid text channel' }],
            isError: true,
          };
        }

        // Validate answers
        if (answers.length < 2 || answers.length > 10) {
          return {
            content: [{ type: 'text', text: 'Error: Polls must have between 2 and 10 answer options' }],
            isError: true,
          };
        }

        // Create poll
        const poll = {
          question: { text: question },
          answers: answers.map(answer => ({ text: answer })),
          duration,
          allowMultiselect,
        };

        const message = await (channel as TextChannel).send({ poll });

        return {
          content: [{
            type: 'text',
            text: `✅ Poll created in <#${channelId}>\n**Question:** ${question}\n**Duration:** ${duration} hours\n**Message ID:** ${message.id}`
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
