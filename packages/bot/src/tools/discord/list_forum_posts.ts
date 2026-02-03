import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, ForumChannel } from 'discord.js';
import { ChannelType } from 'discord.js';

const schema = z.object({
  channelId: z.string().describe('The forum channel ID'),
  limit: z.number().optional().describe('Maximum number of posts to return (default: 20)'),
});

export function createListForumPostsTool(client: Client) {
  return tool(
    'discord_list_forum_posts',
    'List forum posts (threads) in a forum channel',
    schema.shape,
    async ({ channelId, limit = 20 }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildForum) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid forum channel' }],
            isError: true,
          };
        }

        const forumChannel = channel as ForumChannel;
        const threads = await forumChannel.threads.fetchActive();
        const archivedThreads = await forumChannel.threads.fetchArchived({ limit });

        // Combine active and archived threads
        const allThreads = [...threads.threads.values(), ...archivedThreads.threads.values()]
          .slice(0, limit);

        if (allThreads.length === 0) {
          return {
            content: [{ type: 'text', text: `No posts found in <#${channelId}>` }],
          };
        }

        const postList = allThreads.map(thread => {
          const createdTimestamp = Math.floor(thread.createdTimestamp! / 1000);
          const tags = thread.appliedTags.length > 0
            ? `\n  Tags: ${thread.appliedTags.join(', ')}`
            : '';
          const archived = thread.archived ? ' [Archived]' : '';

          return `• **${thread.name}**${archived} (ID: ${thread.id})\n  Created: <t:${createdTimestamp}:R>\n  Messages: ${thread.messageCount || 0}${tags}`;
        }).join('\n\n');

        return {
          content: [{
            type: 'text',
            text: `**Forum Posts in <#${channelId}>:**\n\n${postList}`
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
