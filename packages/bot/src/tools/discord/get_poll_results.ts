import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';

const schema = z.object({
  messageId: z.string().describe('The message ID containing the poll'),
  channelId: z.string().describe('The channel ID where the poll is located'),
});

export function createGetPollResultsTool(client: Client) {
  return tool(
    'discord_get_poll_results',
    'Get the results of a poll',
    schema.shape,
    async ({ messageId, channelId }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid text channel' }],
            isError: true,
          };
        }

        const message = await (channel as TextChannel).messages.fetch(messageId);

        if (!message || !message.poll) {
          return {
            content: [{ type: 'text', text: 'Error: Message not found or does not contain a poll' }],
            isError: true,
          };
        }

        const poll = message.poll;
        const question = poll.question.text;
        const totalVotes = poll.answers.reduce((sum, answer) => sum + answer.voteCount, 0);

        const results = poll.answers.map((answer, index) => {
          const percentage = totalVotes > 0 ? ((answer.voteCount / totalVotes) * 100).toFixed(1) : '0.0';
          return `${index + 1}. **${answer.text}**: ${answer.voteCount} votes (${percentage}%)`;
        }).join('\n');

        const status = poll.resultsFinalized ? '🔒 Ended' : '🟢 Active';

        return {
          content: [{
            type: 'text',
            text: `**Poll Results** ${status}\n\n**Question:** ${question}\n\n${results}\n\n**Total voters:** ${totalVotes}`
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
