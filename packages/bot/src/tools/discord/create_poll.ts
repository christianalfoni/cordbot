import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';

const schema = z.object({
  channelId: z.string().describe('The Discord channel ID to post the poll in'),
  question: z.string().describe('The poll question'),
  answers: z.array(z.string()).min(2).max(10).describe('Poll answer options (2-10 options)'),
  duration: z.number().optional().describe('Poll duration in hours (default: 24, minimum: 1)'),
  allowMultiselect: z.boolean().optional().describe('Allow selecting multiple answers (default: false)'),
});

export function createCreatePollTool(
  client: Client,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_create_poll',
    'Create a poll in a Discord channel (requires permission). TIP: For examples, best practices, and automation patterns, load the discord_poll_management skill.',
    schema.shape,
    async ({ channelId, question, answers, duration = 24, allowMultiselect = false }) => {
      try {
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

        // Validate duration (Discord minimum is 1 hour)
        if (duration < 1) {
          return {
            content: [{ type: 'text', text: 'Error: Poll duration must be at least 1 hour (Discord minimum)' }],
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

        // Format duration for display
        const durationDisplay = duration >= 24
          ? `${Math.round(duration / 24)} day${duration >= 48 ? 's' : ''}`
          : `${duration} hour${duration !== 1 ? 's' : ''}`;

        return {
          content: [{
            type: 'text',
            text: `✅ Poll created in <#${channelId}>\n**Question:** ${question}\n**Duration:** ${durationDisplay}\n**Message ID:** ${message.id}`
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
